// Package encryptor orchestrates folder encryption and decryption by
// composing the lower-level crypto and vault packages.
package encryptor

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"

	gonanoid "github.com/matoous/go-nanoid/v2"
	"golang.org/x/sync/errgroup"

	"github.com/JMMOLLER/kira-encryptor/core/crypto"
	"github.com/JMMOLLER/kira-encryptor/core/internal/jobserver"
	"github.com/JMMOLLER/kira-encryptor/core/internal/movefile"
	"github.com/JMMOLLER/kira-encryptor/core/types"
	"github.com/JMMOLLER/kira-encryptor/core/vault"
	"github.com/awnumar/memguard"
)

// EncryptFolderOptions aliases types.FolderOperationOptions.
type EncryptFolderOptions = types.FolderOperationOptions

// OperationResult aliases types.OperationResult.
type OperationResult = types.OperationResult

// Options aliases types.EncryptorOptions.
type Options = types.EncryptorOptions

// KiraEncryptor is the core orchestrator.
type KiraEncryptor struct {
	opts      types.EncryptorOptions
	vault     *vault.Vault
	dbPathAbs string
	masterKey *memguard.LockedBuffer
}

// New opens or creates the vault and derives the master key.
func New(password *memguard.LockedBuffer, opts types.EncryptorOptions) (*KiraEncryptor, error) {
	dbAbs, err := filepath.Abs(opts.DBPath)
	if err != nil {
		return nil, fmt.Errorf("core: resolving DBPath: %w", err)
	}

	v, err := vault.New(password, opts.DBPath)
	if err != nil {
		return nil, fmt.Errorf("core: opening vault: %w", err)
	}

	return &KiraEncryptor{
		opts:      opts,
		vault:     v,
		dbPathAbs: dbAbs,
		masterKey: v.MasterKey(),
	}, nil
}

// resolvePool returns either a shared jobserver or a local pool.
func resolvePool(jobServerName string, concurrency int) (jobserver.Pool, error) {
	if jobServerName != "" {
		pool, err := jobserver.Attach(jobServerName)
		if err != nil {
			return nil, fmt.Errorf("core: attaching to job server %q: %w", jobServerName, err)
		}
		return pool, nil
	}
	return jobserver.NewLocal(jobserver.ResolveSize(concurrency)), nil
}

// treeNode is the mutable representation used while building the vault tree.
type treeNode struct {
	item     types.VaultItem
	origPath string
	children []*treeNode
}

func (n *treeNode) toVaultItem() types.VaultItem {
	out := n.item
	if len(n.children) > 0 {
		out.Content = make([]types.VaultItem, 0, len(n.children))
		for _, c := range n.children {
			out.Content = append(out.Content, c.toVaultItem())
		}
	}
	return out
}

// fileWork is one unit of encryption work discovered while walking.
type fileWork struct {
	origPath string
	node     *treeNode
}

// stagingPath returns the temporary output path for a file.
func stagingPath(stagingDir string, node *treeNode) string {
	return filepath.Join(stagingDir, node.item.ID+crypto.FILE_EXTENSION)
}

// commitPath returns the file's final encrypted location.
func commitPath(origFilePath string, node *treeNode) string {
	return filepath.Join(filepath.Dir(origFilePath), node.item.ID+crypto.FILE_EXTENSION)
}

// EncryptFolder encrypts a folder in seven phases:
//
//  1. Build the tree.
//  2. Create a staging directory.
//  3. Encrypt files in parallel.
//  4. Commit encrypted files.
//  5. Persist the vault entry.
//  6. Remove plaintext files (only when DeleteOnEnd allows it).
//  7. Rename directories (only when originals were removed).
func (k *KiraEncryptor) EncryptFolder(ctx context.Context, opts types.FolderOperationOptions) (*types.OperationResult, error) {
	// if opts.SecretKey == nil {
	// 	return nil, fmt.Errorf("core: SecretKey is required")
	// }

	folderAbs, err := filepath.Abs(opts.FolderPath)
	if err != nil {
		return nil, fmt.Errorf("core: resolving folder path: %w", err)
	}

	info, err := os.Stat(folderAbs)
	if err != nil {
		return nil, fmt.Errorf("core: stat folder: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("core: %q is not a folder", folderAbs)
	}

	root, work, totalBytes, err := k.buildTree(folderAbs)
	if err != nil {
		return nil, err
	}

	// When originals are preserved, the encrypted tree is built independently
	// to avoid mixing plaintext files with the output structure.
	deleteOriginals := opts.DeleteOnEnd == nil || *opts.DeleteOnEnd

	// Create a temporary staging directory.
	stagingDir, err := os.MkdirTemp("", ".kira-stage-*")
	if err != nil {
		return nil, fmt.Errorf("core: creating staging dir: %w", err)
	}
	defer os.RemoveAll(stagingDir)

	pool, err := resolvePool(opts.JobServerName, opts.Concurrency)
	if err != nil {
		return nil, err
	}
	defer pool.Close()

	var processed atomic.Int64
	group, gctx := errgroup.WithContext(ctx)

	for _, w := range work {
		w := w
		group.Go(func() error {
			token, err := pool.Acquire(gctx)
			if err != nil {
				return err
			}
			defer token.Release()

			return k.encryptOne(gctx, w, stagingDir, totalBytes, &processed, opts.OnProgress)
		})
	}

	if err := group.Wait(); err != nil {
		// Only staged output needs cleanup.
		return nil, fmt.Errorf("core: encrypting folder: %w", err)
	}

	if deleteOriginals {
		// Commit encrypted files in-place and then remove originals, reusing the tree structure.
		for _, w := range work {
			src := stagingPath(stagingDir, w.node)
			dst := commitPath(w.origPath, w.node)
			if err := movefile.MoveFile(src, dst); err != nil {
				return nil, fmt.Errorf("core: committing %q: %w", w.origPath, err)
			}
		}
	} else {
		// Build a separate output tree when originals are preserved.
		if err := createDirTree(root); err != nil {
			return nil, err
		}
		for _, w := range work {
			src := stagingPath(stagingDir, w.node)
			dst := w.node.item.Path
			if err := movefile.MoveFile(src, dst); err != nil {
				return nil, fmt.Errorf("core: committing %q: %w", w.origPath, err)
			}
		}
	}

	if err := k.vault.Set(root.item.ID, root.toVaultItem()); err != nil {
		return nil, fmt.Errorf("core: persisting vault entry: %w", err)
	}

	if deleteOriginals {
		var cleanupErrs []error
		for _, w := range work {
			if err := os.Remove(w.origPath); err != nil {
				cleanupErrs = append(cleanupErrs, fmt.Errorf("core: removing original %q: %w", w.origPath, err))
			}
		}
		if len(cleanupErrs) > 0 {
			return nil, errors.Join(cleanupErrs...)
		}

		// Rename directories in bottom-up order to preserve hierarchy.
		if err := k.renameDirsBottomUp(root); err != nil {
			return nil, err
		}
	}

	return &types.OperationResult{
		RootID:     root.item.ID,
		OutputPath: root.item.Path,
		Files:      len(work),
		Bytes:      totalBytes,
	}, nil
}

// createDirTree creates the encrypted directory structure independently
// of the original tree, preserving directory permissions.
func createDirTree(node *treeNode) error {
	info, err := os.Stat(node.origPath)
	if err != nil {
		return fmt.Errorf("core: stat %q: %w", node.origPath, err)
	}
	if err := os.MkdirAll(node.item.Path, info.Mode().Perm()); err != nil {
		return fmt.Errorf("core: creating folder %q: %w", node.item.Path, err)
	}

	for _, child := range node.children {
		if child.item.Type == types.VaultItemTypeFolder {
			if err := createDirTree(child); err != nil {
				return err
			}
		}
	}

	return nil
}

// buildTree constructs the vault tree and collects the encryption work.
func (k *KiraEncryptor) buildTree(rootPath string) (*treeNode, []fileWork, int64, error) {
	rootID, err := gonanoid.New()
	if err != nil {
		return nil, nil, 0, fmt.Errorf("core: generating id: %w", err)
	}

	rootEncryptedName, err := encryptName(filepath.Base(rootPath), k.masterKey)
	if err != nil {
		return nil, nil, 0, err
	}

	// Root directories are identified on disk by their generated ID.
	rootFinalPath := filepath.Join(filepath.Dir(rootPath), rootID)

	root := &treeNode{
		item: types.VaultItem{
			ID:            rootID,
			Type:          types.VaultItemTypeFolder,
			Path:          rootFinalPath,
			EncryptedName: rootEncryptedName,
		},
		origPath: rootPath,
	}
	nodes := map[string]*treeNode{rootPath: root}

	var work []fileWork
	var totalBytes int64

	lockPath := k.dbPathAbs + ".lock"

	walkErr := filepath.WalkDir(rootPath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == rootPath {
			return nil
		}

		parent, ok := nodes[filepath.Dir(path)]
		if !ok {
			return fmt.Errorf("core: internal error, missing parent node for %q", path)
		}

		name := filepath.Base(path)
		encryptedName, err := encryptName(name, k.masterKey)
		if err != nil {
			return err
		}

		if d.IsDir() {
			id, err := gonanoid.New()
			if err != nil {
				return fmt.Errorf("core: generating id: %w", err)
			}
			// Build the final vault path before any on-disk renames occur.
			finalPath := filepath.Join(parent.item.Path, id)
			node := &treeNode{
				item: types.VaultItem{
					ID:            id,
					Type:          types.VaultItemTypeFolder,
					Path:          finalPath,
					EncryptedName: encryptedName,
				},
				origPath: path,
			}
			parent.children = append(parent.children, node)
			nodes[path] = node
			return nil
		}

		// Skip encrypted files and the vault database.
		if filepath.Ext(path) == crypto.FILE_EXTENSION || path == k.dbPathAbs || path == lockPath {
			return nil
		}

		fi, err := d.Info()
		if err != nil {
			return fmt.Errorf("core: stat %q: %w", path, err)
		}

		id, err := gonanoid.New()
		if err != nil {
			return fmt.Errorf("core: generating id: %w", err)
		}

		finalPath := filepath.Join(parent.item.Path, id+crypto.FILE_EXTENSION)
		node := &treeNode{
			item: types.VaultItem{
				ID:            id,
				Type:          types.VaultItemTypeFile,
				Path:          finalPath,
				Size:          fi.Size(),
				EncryptedName: encryptedName,
			},
			origPath: path,
		}
		parent.children = append(parent.children, node)

		work = append(work, fileWork{origPath: path, node: node})
		totalBytes += fi.Size()

		return nil
	})
	if walkErr != nil {
		return nil, nil, 0, fmt.Errorf("core: walking folder: %w", walkErr)
	}

	return root, work, totalBytes, nil
}

// encryptOne encrypts a single file into the staging directory.
func (k *KiraEncryptor) encryptOne(
	ctx context.Context,
	w fileWork,
	stagingDir string,
	totalBytes int64,
	processed *atomic.Int64,
	onProgress types.ProgressCallback,
) error {
	destPath := stagingPath(stagingDir, w.node)

	var lastReported int64
	fileProgress := func(fileProcessed, _ int64) {
		delta := fileProcessed - lastReported
		lastReported = fileProcessed
		total := processed.Add(delta)
		if onProgress != nil {
			onProgress(total, totalBytes)
		}
	}

	if err := crypto.EncryptFile(ctx, crypto.FileEncryptionOptions{
		FilePath:   w.origPath,
		TempPath:   destPath,
		SecretKey:  k.masterKey,
		OnProgress: fileProgress,
	}); err != nil {
		_ = os.Remove(destPath) // best-effort cleanup
		return fmt.Errorf("core: encrypting %q: %w", w.origPath, err)
	}

	now := time.Now()
	w.node.item.EncryptedAt = &now

	return nil
}

// renameDirsBottomUp renames directories from leaves to root.
func (k *KiraEncryptor) renameDirsBottomUp(root *treeNode) error {
	for _, child := range root.children {
		if err := k.renameDirNode(child); err != nil {
			return err
		}
	}

	if err := movefile.MoveDir(root.origPath, root.item.Path); err != nil {
		return fmt.Errorf("core: renaming root folder %q: %w", root.origPath, err)
	}

	return nil
}

func (k *KiraEncryptor) renameDirNode(node *treeNode) error {
	if node.item.Type != types.VaultItemTypeFolder {
		return nil
	}

	for _, child := range node.children {
		if err := k.renameDirNode(child); err != nil {
			return err
		}
	}

	// Rename the directory to its generated ID.
	finalPath := filepath.Join(filepath.Dir(node.origPath), node.item.ID)
	if err := movefile.MoveDir(node.origPath, finalPath); err != nil {
		return fmt.Errorf("core: renaming folder %q: %w", node.origPath, err)
	}

	return nil
}

// encryptName encrypts a filesystem name for storage in the vault.
func encryptName(name string, secretKey *memguard.LockedBuffer) (string, error) {
	cipherBytes, err := crypto.EncryptBytes([]byte(name), secretKey, types.BufferEncodingBase64URL)
	if err != nil {
		return "", fmt.Errorf("core: encrypting name %q: %w", name, err)
	}
	encoded, err := crypto.ByteToString(cipherBytes, types.BufferEncodingBase64URL)
	if err != nil {
		return "", fmt.Errorf("core: encoding name %q: %w", name, err)
	}
	return encoded, nil
}

// decryptName reverses encryptName.
func decryptName(encryptedName string, secretKey *memguard.LockedBuffer) (string, error) {
	cipherBytes, err := crypto.StringToByte(encryptedName, types.BufferEncodingBase64URL)
	if err != nil {
		return "", fmt.Errorf("core: decoding name %q: %w", encryptedName, err)
	}
	plainBytes, err := crypto.DecryptBytes(cipherBytes, secretKey, types.BufferEncodingBase64URL)
	if err != nil {
		return "", fmt.Errorf("core: decrypting name %q: %w", encryptedName, err)
	}
	return string(plainBytes), nil
}

// decryptFileWork represents a file scheduled for decryption.
type decryptFileWork struct {
	item        types.VaultItem
	currentPath string
	parentPath  string
}

// decryptStagingPath returns the temporary output path keyed by file ID.
func decryptStagingPath(stagingDir string, item types.VaultItem) string {
	return filepath.Join(stagingDir, item.ID)
}

// Stored paths are rebuilt from the current root to allow relocating encrypted folders.
func collectDecryptWork(root types.VaultItem, rootPath string) ([]decryptFileWork, int64) {
	var work []decryptFileWork
	var totalBytes int64

	var walk func(item types.VaultItem, currentPath string)
	walk = func(item types.VaultItem, currentPath string) {
		if item.Type != types.VaultItemTypeFolder {
			work = append(work, decryptFileWork{
				item:        item,
				currentPath: currentPath,
				parentPath:  filepath.Dir(currentPath),
			})
			totalBytes += item.Size
			return
		}

		for _, child := range item.Content {
			childPath := filepath.Join(currentPath, filepath.Base(child.Path))
			walk(child, childPath)
		}
	}

	walk(root, rootPath)

	return work, totalBytes
}

// DecryptFolder reverses EncryptFolder in five phases:
//
//  1. Load the encrypted tree from the vault.
//  2. Decrypt files in parallel into a staging directory.
//  3. Commit decrypted files (only when ciphertext originals are removed).
//  4. Remove the original ciphertext files (only when DeleteOnEnd allows it).
//  5. Rename directories bottom-up, back to their plaintext names (only
//     when ciphertext originals were removed).
//
// opts.FolderPath must point at the already-encrypted root folder (the
// one named after its vault ID).
func (k *KiraEncryptor) DecryptFolder(ctx context.Context, opts types.FolderOperationOptions) (*types.OperationResult, error) {
	// if opts.SecretKey == nil {
	// 	return nil, fmt.Errorf("core: SecretKey is required")
	// }

	folderAbs, err := filepath.Abs(opts.FolderPath)
	if err != nil {
		return nil, fmt.Errorf("core: resolving folder path: %w", err)
	}

	info, err := os.Stat(folderAbs)
	if err != nil {
		return nil, fmt.Errorf("core: stat folder: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("core: %q is not a folder", folderAbs)
	}

	// Root directory names match their vault ID.
	rootID := filepath.Base(folderAbs)

	var root types.VaultItem
	if err := k.vault.Get(rootID, &root); err != nil {
		return nil, fmt.Errorf("core: loading vault entry %q: %w", rootID, err)
	}

	work, totalBytes := collectDecryptWork(root, folderAbs)

	deleteOriginals := opts.DeleteOnEnd == nil || *opts.DeleteOnEnd

	// Create a temporary staging directory.
	stagingDir, err := os.MkdirTemp("", ".kira-unstage-*")
	if err != nil {
		return nil, fmt.Errorf("core: creating staging dir: %w", err)
	}
	defer os.RemoveAll(stagingDir)

	pool, err := resolvePool(opts.JobServerName, opts.Concurrency)
	if err != nil {
		return nil, err
	}
	defer pool.Close()

	// Decrypt files in parallel.
	var processed atomic.Int64
	group, gctx := errgroup.WithContext(ctx)

	for _, w := range work {
		w := w
		group.Go(func() error {
			token, err := pool.Acquire(gctx)
			if err != nil {
				return err
			}
			defer token.Release()

			return k.decryptOne(gctx, w, stagingDir, totalBytes, &processed, opts.OnProgress)
		})
	}

	if err := group.Wait(); err != nil {
		// Only staged output needs cleanup.
		return nil, fmt.Errorf("core: decrypting folder: %w", err)
	}

	if deleteOriginals {
		for _, w := range work {
			plainName, err := decryptName(w.item.EncryptedName, k.masterKey)
			if err != nil {
				return nil, err
			}
			src := decryptStagingPath(stagingDir, w.item)
			dst := filepath.Join(w.parentPath, plainName)
			if err := movefile.MoveFile(src, dst); err != nil {
				return nil, fmt.Errorf("core: committing %q: %w", w.currentPath, err)
			}
		}
	}

	result := &types.OperationResult{
		RootID: rootID,
		Files:  len(work),
		Bytes:  totalBytes,
	}

	if opts.DeleteOnEnd == nil || *opts.DeleteOnEnd {
		var cleanupErrs []error
		for _, w := range work {
			if err := os.Remove(w.currentPath); err != nil {
				cleanupErrs = append(cleanupErrs, fmt.Errorf("core: removing ciphertext %q: %w", w.currentPath, err))
			}
		}
		if len(cleanupErrs) > 0 {
			return nil, errors.Join(cleanupErrs...)
		}

		outputPath, err := k.decryptDirsBottomUp(root, folderAbs, opts.OnConflict)
		if err != nil {
			return nil, err
		}

		if err := k.vault.Delete(rootID); err != nil {
			return nil, fmt.Errorf("core: removing vault entry: %w", err)
		}

		result.OutputPath = outputPath
	} else {
		dirDest, err := k.createPlaintextDirTree(root, folderAbs, opts.OnConflict)
		if err != nil {
			return nil, err
		}
		for _, w := range work {
			plainName, err := decryptName(w.item.EncryptedName, k.masterKey)
			if err != nil {
				return nil, err
			}
			src := decryptStagingPath(stagingDir, w.item)
			dst := filepath.Join(dirDest[w.parentPath], plainName)
			if err := movefile.MoveFile(src, dst); err != nil {
				return nil, fmt.Errorf("core: committing %q: %w", w.currentPath, err)
			}
		}

		result.OutputPath = dirDest[folderAbs]
	}

	return result, nil
}

// createPlaintextDirTree builds a mirrored directory structure with decrypted names,
// rooted as a sibling of the ciphertext tree. It returns a mapping from original
// paths to plaintext destinations for direct file placement without touching source data.
func (k *KiraEncryptor) createPlaintextDirTree(root types.VaultItem, rootPath string, onConflict types.ConflictCallback) (map[string]string, error) {
	dirDest := make(map[string]string)

	rootPlainName, err := decryptName(root.EncryptedName, k.masterKey)
	if err != nil {
		return nil, err
	}
	intendedRootDest := filepath.Join(filepath.Dir(rootPath), rootPlainName)
	rootDest, err := resolveDirConflict(intendedRootDest)
	if err != nil {
		return nil, err
	}
	if rootDest != intendedRootDest && onConflict != nil {
		onConflict(intendedRootDest, rootDest)
	}

	info, err := os.Stat(rootPath)
	if err != nil {
		return nil, fmt.Errorf("core: stat %q: %w", rootPath, err)
	}
	if err := os.MkdirAll(rootDest, info.Mode().Perm()); err != nil {
		return nil, fmt.Errorf("core: creating folder %q: %w", rootDest, err)
	}
	dirDest[rootPath] = rootDest

	var walk func(item types.VaultItem, currentPath, destPath string) error
	walk = func(item types.VaultItem, currentPath, destPath string) error {
		for _, child := range item.Content {
			if child.Type != types.VaultItemTypeFolder {
				continue
			}

			childCurrent := filepath.Join(currentPath, filepath.Base(child.Path))
			plainName, err := decryptName(child.EncryptedName, k.masterKey)
			if err != nil {
				return err
			}
			childDest := filepath.Join(destPath, plainName)

			info, err := os.Stat(childCurrent)
			if err != nil {
				return fmt.Errorf("core: stat %q: %w", childCurrent, err)
			}
			if err := os.MkdirAll(childDest, info.Mode().Perm()); err != nil {
				return fmt.Errorf("core: creating folder %q: %w", childDest, err)
			}
			dirDest[childCurrent] = childDest

			if err := walk(child, childCurrent, childDest); err != nil {
				return err
			}
		}
		return nil
	}

	if err := walk(root, rootPath, rootDest); err != nil {
		return nil, err
	}

	return dirDest, nil
}

// decryptOne decrypts a single file into the staging directory.
func (k *KiraEncryptor) decryptOne(
	ctx context.Context,
	w decryptFileWork,
	stagingDir string,
	totalBytes int64,
	processed *atomic.Int64,
	onProgress types.ProgressCallback,
) error {
	destPath := decryptStagingPath(stagingDir, w.item)

	var lastReported int64
	fileProgress := func(fileProcessed, _ int64) {
		delta := fileProcessed - lastReported
		lastReported = fileProcessed
		total := processed.Add(delta)
		if onProgress != nil {
			onProgress(total, totalBytes)
		}
	}

	if err := crypto.DecryptFile(ctx, crypto.FileDecryptionOptions{
		FilePath:   w.currentPath,
		TempPath:   destPath,
		SecretKey:  k.masterKey,
		OnProgress: fileProgress,
	}); err != nil {
		_ = os.Remove(destPath) // best-effort cleanup
		return fmt.Errorf("core: decrypting %q: %w", w.currentPath, err)
	}

	return nil
}

// resolveDirConflict returns a non-colliding destination path.
// If the path exists, it appends a timestamp, and if needed a random suffix.
// This is best-effort due to TOCTOU; callers must still handle move failures.
func resolveDirConflict(dst string) (string, error) {
	if _, err := os.Stat(dst); err != nil {
		if os.IsNotExist(err) {
			return dst, nil
		}
		return "", fmt.Errorf("core: checking %q: %w", dst, err)
	}

	candidate := fmt.Sprintf("%s-%s", dst, time.Now().Format("20060102-150405"))
	if _, err := os.Stat(candidate); err != nil {
		if os.IsNotExist(err) {
			return candidate, nil
		}
		return "", fmt.Errorf("core: checking %q: %w", candidate, err)
	}

	suffix, err := gonanoid.New(6)
	if err != nil {
		return "", fmt.Errorf("core: generating disambiguation suffix: %w", err)
	}
	return fmt.Sprintf("%s-%s", candidate, suffix), nil
}

// decryptDirsBottomUp restores directory names from leaves to root.
func (k *KiraEncryptor) decryptDirsBottomUp(root types.VaultItem, rootPath string, onConflict types.ConflictCallback) (string, error) {
	for _, child := range root.Content {
		childPath := filepath.Join(rootPath, filepath.Base(child.Path))
		if err := k.decryptDirNode(child, childPath); err != nil {
			return "", err
		}
	}

	plainName, err := decryptName(root.EncryptedName, k.masterKey)
	if err != nil {
		return "", err
	}
	intendedPath := filepath.Join(filepath.Dir(rootPath), plainName)
	finalPath, err := resolveDirConflict(intendedPath)
	if err != nil {
		return "", err
	}
	if finalPath != intendedPath && onConflict != nil {
		onConflict(intendedPath, finalPath)
	}

	if err := movefile.MoveDir(rootPath, finalPath); err != nil {
		return "", fmt.Errorf("core: renaming root folder %q: %w", rootPath, err)
	}

	return finalPath, nil
}

func (k *KiraEncryptor) decryptDirNode(node types.VaultItem, currentPath string) error {
	if node.Type != types.VaultItemTypeFolder {
		return nil
	}

	// Rename children before their parent.
	for _, child := range node.Content {
		childPath := filepath.Join(currentPath, filepath.Base(child.Path))
		if err := k.decryptDirNode(child, childPath); err != nil {
			return err
		}
	}

	plainName, err := decryptName(node.EncryptedName, k.masterKey)
	if err != nil {
		return err
	}
	finalPath := filepath.Join(filepath.Dir(currentPath), plainName)
	if err := movefile.MoveDir(currentPath, finalPath); err != nil {
		return fmt.Errorf("core: renaming folder %q: %w", currentPath, err)
	}

	return nil
}

func (k *KiraEncryptor) ListEncrypted() ([]types.VaultEntry, error) {
	keys := k.vault.Keys()
	entries := make([]types.VaultEntry, 0, len(keys))

	for _, key := range keys {
		var item types.VaultItem
		if err := k.vault.Get(key, &item); err != nil {
			return nil, fmt.Errorf("core: loading vault entry %q: %w", key, err)
		}
		entry, err := k.toVaultEntry(item)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

func (k *KiraEncryptor) toVaultEntry(item types.VaultItem) (types.VaultEntry, error) {
	name, err := decryptName(item.EncryptedName, k.masterKey)
	if err != nil {
		return types.VaultEntry{}, err
	}

	entry := types.VaultEntry{
		ID:          item.ID,
		Name:        name,
		Type:        item.Type,
		Size:        item.Size,
		EncryptedAt: item.EncryptedAt,
		IsHidden:    item.IsHidden,
	}

	for _, child := range item.Content {
		childEntry, err := k.toVaultEntry(child)
		if err != nil {
			return types.VaultEntry{}, err
		}
		entry.Children = append(entry.Children, childEntry)
	}

	return entry, nil
}

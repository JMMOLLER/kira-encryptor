package crypto

const (
	FILE_EXTENSION      = ".kira"
	FILE_FORMAT_VERSION = byte(0x02)

	SALT_BYTES       = 32
	SECRET_KEY_BYTES = 32
	FILE_KEY_BYTES   = 32
	HEADER_LEN_BYTES = 4

	OPS_LIMIT = 3
	MEM_LIMIT = 64 * 1024
)

type Magic [4]byte

var FILE_MAGIC = Magic{'A', 'K', 'R', 'A'}

func FileMagicLen() int {
	return len(FILE_MAGIC)
}

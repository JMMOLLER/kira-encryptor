declare global {
  declare namespace NodeJS {
    interface Process {
      pkg?: {
        path: {
          resolve: (...args: string[]) => string;
        };
        entrypoint: string;
        defaultEntrypoint: string;
      };
    }
  }

  type CliAction = "encrypt" | "decrypt";
  type CliActionFor = "file" | "folder";

  interface SecureCredential {
    password: sodium.SecureBuffer;
    ready: boolean;
  }
}
export {};

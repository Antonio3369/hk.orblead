declare module "mailparser" {
  export interface Attachment {
    filename?: string;
    content?: Buffer;
  }

  export function simpleParser(source: Buffer | NodeJS.ReadableStream): Promise<{
    subject?: string;
    date?: Date;
    attachments?: Attachment[];
  }>;
}

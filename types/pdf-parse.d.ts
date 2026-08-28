declare module "pdf-parse" {
  type PdfParseResult = { text?: string };
  const parse: (buffer: Buffer | Uint8Array) => Promise<PdfParseResult>;
  export default parse;
}

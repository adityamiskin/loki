import { tool } from "ai";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const DEFAULT_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

export const readFile = tool({
  description: `Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The filePath parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- You have the capability to call multiple tools in a single response. It is always better to speculatively read multiple files as a batch that are potentially useful.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.
- You can read image files using this tool.`,
  inputSchema: z.object({
    filePath: z.string().describe("The path to the file to read"),
    offset: z.coerce
      .number()
      .describe("The line number to start reading from (0-based)")
      .optional(),
    limit: z.coerce
      .number()
      .describe("The number of lines to read (defaults to 2000)")
      .optional(),
  }),
  execute: async ({ filePath, offset = 0, limit = DEFAULT_READ_LIMIT }) => {
    let filepath = filePath;
    if (!path.isAbsolute(filepath)) {
      filepath = path.join(process.cwd(), filepath);
    }

    // Check if file exists
    if (!fs.existsSync(filepath)) {
      throw new Error(`File not found: ${filepath}`);
    }

    const file = Bun.file(filepath);

    // Check if it's an image or PDF
    const isImage =
      file.type.startsWith("image/") && file.type !== "image/svg+xml";
    const isPdf = file.type === "application/pdf";

    if (isImage || isPdf) {
      const mime = file.type;
      const bytes = await file.bytes();
      const base64 = Buffer.from(bytes).toString("base64");
      return {
        content: `${isImage ? "Image" : "PDF"} file (${mime})`,
        dataUrl: `data:${mime};base64,${base64}`,
        type: isImage ? "image" : "pdf",
      };
    }

    // Check if binary file
    if (await isBinaryFile(filepath, file)) {
      throw new Error(`Cannot read binary file: ${filepath}`);
    }

    // Read text file
    const text = await file.text();
    const lines = text.split("\n");

    const raw = lines.slice(offset, offset + limit).map((line) => {
      return line.length > MAX_LINE_LENGTH
        ? line.substring(0, MAX_LINE_LENGTH) + "..."
        : line;
    });

    const content = raw.map((line, index) => {
      return `${(index + offset + 1).toString().padStart(5, "0")}| ${line}`;
    });

    let output = "<file>\n";
    output += content.join("\n");

    const totalLines = lines.length;
    const lastReadLine = offset + content.length;
    const hasMoreLines = totalLines > lastReadLine;

    if (hasMoreLines) {
      output += `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${lastReadLine})`;
    } else {
      output += `\n\n(End of file - total ${totalLines} lines)`;
    }
    output += "\n</file>";

    return {
      content: output,
      filePath: filepath,
      totalLines,
      linesRead: content.length,
    };
  },
});

async function isBinaryFile(
  filepath: string,
  file: Bun.BunFile
): Promise<boolean> {
  const ext = path.extname(filepath).toLowerCase();
  // binary check for common non-text extensions
  switch (ext) {
    case ".zip":
    case ".tar":
    case ".gz":
    case ".exe":
    case ".dll":
    case ".so":
    case ".class":
    case ".jar":
    case ".war":
    case ".7z":
    case ".doc":
    case ".docx":
    case ".xls":
    case ".xlsx":
    case ".ppt":
    case ".pptx":
    case ".odt":
    case ".ods":
    case ".odp":
    case ".bin":
    case ".dat":
    case ".obj":
    case ".o":
    case ".a":
    case ".lib":
    case ".wasm":
    case ".pyc":
    case ".pyo":
      return true;
    default:
      break;
  }

  const stat = await file.stat();
  const fileSize = stat.size;
  if (fileSize === 0) return false;

  const bufferSize = Math.min(4096, fileSize);
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) return false;
  const bytes = new Uint8Array(buffer.slice(0, bufferSize));

  let nonPrintableCount = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) {
      nonPrintableCount++;
    }
  }
  // If >30% non-printable characters, consider it binary
  return nonPrintableCount / bytes.length > 0.3;
}

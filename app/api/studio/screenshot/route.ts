import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("dev only", { status: 405 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file" }, { status: 400 });

  const id = Date.now().toString(36);
  const dir = path.resolve(process.cwd(), `.context/attachments/${id}`);
  mkdirSync(dir, { recursive: true });

  const bytes = await file.arrayBuffer();
  const ext = file.name.split(".").pop() ?? "png";
  const filePath = path.join(dir, `image.${ext}`);
  writeFileSync(filePath, Buffer.from(bytes));

  const relativePath = `.context/attachments/${id}/image.${ext}`;
  return Response.json({ path: relativePath, id });
}

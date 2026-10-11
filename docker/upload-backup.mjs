// Upload a database dump to the configured S3/R2 bucket under backups/ (server-side only).
// Usage (inside the app container): node docker/upload-backup.mjs /backups/<file>.sql.gz
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const file = process.argv[2];
if (!file) {
  console.error("usage: upload-backup.mjs <file>");
  process.exit(2);
}
const bucket = process.env.BACKUP_S3_BUCKET || process.env.S3_BUCKET;
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});
const key = `backups/${basename(file)}`;
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(file),
    ContentLength: statSync(file).size,
    ContentType: "application/gzip",
  }),
);
console.log(`Uploaded ${file} → s3://${bucket}/${key}`);

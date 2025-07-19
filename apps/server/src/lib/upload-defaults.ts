import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { readFile } from "fs/promises";
import { join } from "path";

config();

const S3_CONFIG = {
  BUCKET_NAME: process.env.S3_BUCKET_NAME!,
  ENDPOINT: process.env.S3_ENDPOINT!,
  ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID!,
  SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY!,
};

const r2Client = new S3Client({
  region: "auto",
  endpoint: S3_CONFIG.ENDPOINT,
  credentials: {
    accessKeyId: S3_CONFIG.ACCESS_KEY_ID,
    secretAccessKey: S3_CONFIG.SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function uploadDefaultAudioFiles() {
  console.log("🎵 Uploading default audio files to MinIO");
  console.log("==========================================");

  // Path to the client's public folder
  const publicPath = join(__dirname, "../../../client/public");
  
  // List of audio files to upload
  const audioFiles = [
    "DROELOE x San Holo - Lines of the Broken (ft. CUT).mp3",
    "INZO x ILLUSIO - Just A Mirage.mp3",
    "Jacob Tillberg - Feel You.mp3",
    "joyful - chess (slowed).mp3",
    "STVCKS - Don't Be Scared.mp3",
    "Tom Reev, Assix & Jason Gewalt - Where It Hurts.mp3",
    "trndsttr.mp3",
  ];

  let uploadedCount = 0;
  let failedCount = 0;

  for (const fileName of audioFiles) {
    try {
      console.log(`📂 Uploading: ${fileName}`);
      
      const filePath = join(publicPath, fileName);
      const fileContent = await readFile(filePath);
      
      const command = new PutObjectCommand({
        Bucket: S3_CONFIG.BUCKET_NAME,
        Key: `default/${fileName}`,
        Body: fileContent,
        ContentType: "audio/mpeg",
        Metadata: {
          uploadedAt: new Date().toISOString(),
          type: "default-audio",
        },
      });

      await r2Client.send(command);
      console.log(`✅ Uploaded: ${fileName}`);
      uploadedCount++;
      
    } catch (error) {
      console.error(`❌ Failed to upload ${fileName}:`, error);
      failedCount++;
    }
  }

  console.log("");
  console.log("📊 Upload Summary:");
  console.log(`   ✅ Successful: ${uploadedCount}`);
  console.log(`   ❌ Failed: ${failedCount}`);
  console.log(`   📦 Total: ${audioFiles.length}`);
  
  if (uploadedCount > 0) {
    console.log("");
    console.log("🌐 Default audio files are now available at:");
    audioFiles.slice(0, uploadedCount).forEach(file => {
      console.log(`   ${process.env.S3_PUBLIC_URL}/default/${file}`);
    });
  }
}

// Run the upload
uploadDefaultAudioFiles().catch(console.error);

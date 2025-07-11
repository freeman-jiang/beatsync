import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";

config();

async function testS3Connection() {
  console.log("🧪 Testing S3 Connection");
  console.log("========================");
  
  const S3_CONFIG = {
    BUCKET_NAME: process.env.S3_BUCKET_NAME,
    PUBLIC_URL: process.env.S3_PUBLIC_URL,
    ENDPOINT: process.env.S3_ENDPOINT,
    ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  };

  console.log("📋 Configuration:");
  console.log("   Endpoint:", S3_CONFIG.ENDPOINT);
  console.log("   Bucket:", S3_CONFIG.BUCKET_NAME);
  console.log("   Public URL:", S3_CONFIG.PUBLIC_URL);
  console.log("   Access Key:", S3_CONFIG.ACCESS_KEY_ID ? "✅ Set" : "❌ Missing");
  console.log("   Secret Key:", S3_CONFIG.SECRET_ACCESS_KEY ? "✅ Set" : "❌ Missing");
  console.log("");

  if (!S3_CONFIG.ENDPOINT || !S3_CONFIG.ACCESS_KEY_ID || !S3_CONFIG.SECRET_ACCESS_KEY) {
    console.error("❌ Missing required configuration. Please check your .env file.");
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: S3_CONFIG.ENDPOINT,
    credentials: {
      accessKeyId: S3_CONFIG.ACCESS_KEY_ID,
      secretAccessKey: S3_CONFIG.SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  try {
    console.log("🔌 Testing connection...");
    const command = new ListBucketsCommand({});
    const response = await client.send(command);
    
    console.log("✅ Connection successful!");
    console.log(`📦 Available buckets: ${response.Buckets?.length || 0}`);
    
    if (response.Buckets) {
      response.Buckets.forEach(bucket => {
        const isTarget = bucket.Name === S3_CONFIG.BUCKET_NAME;
        console.log(`   ${isTarget ? "🎯" : "📦"} ${bucket.Name} ${isTarget ? "(target)" : ""}`);
      });
    }

    // Check if target bucket exists
    const targetBucketExists = response.Buckets?.some(b => b.Name === S3_CONFIG.BUCKET_NAME);
    if (targetBucketExists) {
      console.log(`✅ Target bucket '${S3_CONFIG.BUCKET_NAME}' exists`);
    } else {
      console.log(`❌ Target bucket '${S3_CONFIG.BUCKET_NAME}' not found`);
      console.log("💡 Make sure MinIO is running and the bucket is created");
    }

  } catch (error) {
    console.error("❌ Connection failed:", error);
    console.log("");
    console.log("🔧 Troubleshooting:");
    console.log("1. Make sure MinIO is running: docker-compose -f docker-compose.dev.yml up -d");
    console.log("2. Check MinIO console: http://localhost:9001");
    console.log("3. Verify .env configuration");
    console.log("4. Try accessing MinIO API: curl http://localhost:9000/minio/health/live");
  }
}

// Run the test
testS3Connection();

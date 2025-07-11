import { 
  generatePresignedUploadUrl, 
  deleteObjectsWithPrefix, 
  listObjectsWithPrefix,
  getPublicAudioUrl 
} from "./r2";
import { config } from "dotenv";

config();

async function testCleanupOperation() {
  console.log("🧪 Testing Cleanup Operation");
  console.log("============================");
  
  const testRoomId = "test-room-123";
  const testFileName = "test-audio.mp3";
  
  try {
    // Test 1: List objects for a room that doesn't exist
    console.log("\n📋 Test 1: List objects for non-existent room");
    const emptyList = await listObjectsWithPrefix(`room-${testRoomId}`);
    console.log(`✅ Empty room list: ${emptyList?.length || 0} objects`);
    
    // Test 2: Try to delete objects from empty room
    console.log("\n🗑️ Test 2: Delete from empty room");
    const deleteResult = await deleteObjectsWithPrefix(`room-${testRoomId}`);
    console.log(`✅ Delete result: ${deleteResult.deletedCount} objects deleted`);
    
    // Test 3: Generate a presigned URL (this doesn't actually upload, just tests URL generation)
    console.log("\n🔗 Test 3: Generate presigned URL");
    const presignedUrl = await generatePresignedUploadUrl(testRoomId, testFileName, "audio/mpeg");
    console.log(`✅ Presigned URL generated: ${presignedUrl.length > 0 ? "Success" : "Failed"}`);
    
    // Test 4: Get public URL
    console.log("\n🌐 Test 4: Generate public URL");
    const publicUrl = getPublicAudioUrl(testRoomId, testFileName);
    console.log(`✅ Public URL: ${publicUrl}`);
    
    console.log("\n🎉 All tests passed!");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    
    if (error instanceof Error) {
      if (error.message.includes('url or port') || error.message.includes('FailedToOpenSocket')) {
        console.error('\n🔧 This looks like a connection issue.');
        console.error('   Make sure MinIO is running: docker-compose -f docker-compose.dev.yml up -d');
        console.error('   Check MinIO health: curl http://localhost:9000/minio/health/live');
      }
    }
  }
}

// Run the test
testCleanupOperation();

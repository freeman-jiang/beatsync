import { listObjectsWithPrefix } from "./r2";

const main = async () => {
  const objects = await listObjectsWithPrefix("");
  console.log("All objects:", objects);

  // Delete all objects
  // console.log(await deleteObjectsWithPrefix(""));
};

main();

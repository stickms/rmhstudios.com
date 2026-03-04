import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

const postsDirectory = path.join(process.cwd(), "content/blog");
const outputFile = path.join(process.cwd(), "scripts/blog-data.json");

function main() {
  if (!fs.existsSync(postsDirectory)) {
    console.log(`Directory not found: ${postsDirectory}.`);
    return;
  }

  const filenames = fs.readdirSync(postsDirectory).filter(f => f.endsWith('.mdx'));
  const allData = [];

  for (const filename of filenames) {
    const slug = filename.replace(/\.mdx$/, "");
    const fullPath = path.join(postsDirectory, filename);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);
    
    allData.push({
      slug,
      title: data.title || "Untitled",
      date: data.date || new Date().toISOString().split('T')[0],
      description: data.description || "",
      image: data.image || null,
      tags: data.tags || [],
      content: content
    });
  }

  fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2));
  console.log(`Generated blog data at ${outputFile} with ${allData.length} posts.`);
}

main();

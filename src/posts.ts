import { getCollection } from "astro:content";

// Published blog posts, newest first. Drafts are only included in dev.
export async function getPosts() {
  const posts = await getCollection("blog", ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

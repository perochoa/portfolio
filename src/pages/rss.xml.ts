import type { APIContext } from 'astro';
import rss from '@astrojs/rss';
import { withBase } from '../utils';
import { getPosts } from '../posts';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context: APIContext) {
	const posts = await getPosts();
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: new URL(withBase("/"), context.site),
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: withBase(`blog/${post.id}/`),
		})),
	});
}

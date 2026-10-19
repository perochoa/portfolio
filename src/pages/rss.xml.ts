import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { withBase } from '../utils';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context: APIContext) {
	const posts = await getCollection('blog');
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: new URL(withBase("/"), context.site),
		items: posts.map((post) => ({
			...post.data,
			link: withBase(`blog/${post.id}/`),
		})),
	});
}

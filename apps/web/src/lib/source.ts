import { docs, blog as blogPosts } from "collections/server";
import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

export const source = loader({ docs: docs.toFumadocsSource() }, {
  baseUrl: "/docs",
});

export const blog = loader(toFumadocsSource(blogPosts, []), {
  baseUrl: '/blog',
});
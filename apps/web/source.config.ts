import { applyMdxPreset, defineCollections, defineDocs } from "fumadocs-mdx/config";
import { remarkMdxFiles } from 'fumadocs-core/mdx-plugins';
import { remarkSteps } from 'fumadocs-core/mdx-plugins/remark-steps';
import { remarkTypeScriptToJavaScript } from 'fumadocs-docgen/remark-ts2js';
import { pageSchema } from 'fumadocs-core/source/schema';
import z from "zod";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
    mdxOptions: applyMdxPreset({
      remarkPlugins: [remarkMdxFiles, remarkSteps, remarkTypeScriptToJavaScript],
    })
  },
});

export const blog = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  schema: pageSchema.extend({
    date: z.date(),
    author: z.string(),
    tags: z.array(z.string()),
  }),
});
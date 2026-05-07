import { applyMdxPreset, defineDocs } from "fumadocs-mdx/config";
import { remarkMdxFiles } from 'fumadocs-core/mdx-plugins';
import { remarkSteps } from 'fumadocs-core/mdx-plugins/remark-steps';
import { remarkTypeScriptToJavaScript } from 'fumadocs-docgen/remark-ts2js';

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

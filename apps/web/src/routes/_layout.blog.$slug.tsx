import { useMDXComponents } from '#/components/mdx';
import { blog } from '#/lib/source';
import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start';
import browserCollections from 'collections/browser';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Suspense } from 'react';

const serverLoader = createServerFn({
  method: "GET",
})
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const page = blog.getPage([slug]);
    if (!page) throw notFound();

    return {
      path: page.path,
      pageTree: await blog.serializePageTree(blog.getPageTree()),
    };
  });

export const Route = createFileRoute('/_layout/blog/$slug')({
  component: RouteComponent,
  loader: async ({ params }) => {
    const slug = params.slug;
    const data = await serverLoader({ data: slug });
    await clientLoader.preload(data.path);
    return data;
  },
})

const clientLoader = browserCollections.blog.createClientLoader({
  component(
    { toc, frontmatter, default: MDX },
    // you can define props for the component
    _props: undefined,
  ) {
    return (
      <div className='inner pb-20 pt-30 px-8 border-x'>
        <div className='flex flex-col gap-12'>
          <div className='flex flex-col gap-8 text-center max-w-xl mx-auto'>
            <div className='flex flex-wrap gap-2 justify-center items-center'>
              <span className='text-muted font-semibold text-sm'>{frontmatter.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span>・</span>
              <span className='text-muted font-semibold text-sm'>Written by {frontmatter.author}</span>
            </div>
            <h1 className='text-5xl'>{frontmatter.title}</h1>
            <p className='text-xl'>{frontmatter.description}</p>
          </div>

          <div className='max-w-2xl mx-auto flex flex-col gap-6'>
            <InlineTOC items={toc} />

            <div className='prose lg:text-lg'>
              <MDX components={useMDXComponents()} />
            </div>
          </div>
        </div>
      </div>
    );
  },
});

function RouteComponent() {
  const data = useFumadocsLoader(Route.useLoaderData());

  return <Suspense>{clientLoader.useContent(data.path)}</Suspense>

}

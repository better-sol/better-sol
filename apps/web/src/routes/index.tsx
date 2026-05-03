import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="inner">
      <div className="grid grid-cols-2 py-20">
        <h1 className="text-6xl font-bold">
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Quae tempore
          architecto.
        </h1>
        <p className="text-xl">
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Quia ipsum,
          doloribus nobis illo natus, sit sed asperiores suscipit dolore quis
          animi recusandae iste nulla? Harum alias eligendi quod in vero?
        </p>
      </div>
    </div>
  );
}

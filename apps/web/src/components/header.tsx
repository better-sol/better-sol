import { Button, buttonVariants } from "@heroui/react";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitState,
} from "@reown/appkit/react";
import { Link } from "@tanstack/react-router";
import SolarWalletMoneyLineDuotone from "~icons/solar/wallet-money-line-duotone";
import SolarKeyMinimalisticLineDuotone from "~icons/solar/key-minimalistic-line-duotone";
import SolarSunLineDuotone from "~icons/solar/sun-line-duotone";
import SolarMoonLineDuotone from "~icons/solar/moon-line-duotone";
import SolarHamburgerMenuLineDuotone from "~icons/solar/hamburger-menu-line-duotone";
import SolarCloseCircleLineDuotone from "~icons/solar/close-circle-line-duotone";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveAccount } from "#/functions/account.functions";
import { useTheme } from "fumadocs-ui/provider/base";
import SolarArrowRightLineDuotone from "~icons/solar/arrow-right-line-duotone";

function GithubIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

const Header = () => {
  const { open } = useAppKit();
  const { initialized } = useAppKitState();
  const { isConnected, address } = useAppKitAccount();
  const saveAccountFn = useServerFn(saveAccount);
  const { resolvedTheme, setTheme } = useTheme();

  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (isConnected && address) {
      saveAccountFn({ data: { address } });
    }
  }, [isConnected, address]);

  return (
    <header className="fixed top-0 inset-x-0 border-b bg-background/70 z-9999999999 backdrop-blur-3xl">
      <Link
        to="/blog/$slug"
        params={{ slug: "alpha-launch" }}
        className="bg-surface block hover:bg-accent-soft-hover transition-all"
      >
        <div className="inner py-2 px-6 md:px-8 border-x text-surface-foreground text-center flex items-center justify-center gap-1">
          <span>Better Sol Alpha, Read More</span>{" "}
          <SolarArrowRightLineDuotone />
        </div>
      </Link>
      <div className="inner border-x px-6 md:px-8 h-14 flex items-center justify-between">
        <Link
          to="/"
          className="text-lg md:text-xl flex items-center gap-1 font-bold tracking-tighter"
        >
          <img className="size-5" src="/icon.svg" alt="Better Sol" />
          Better Sol
        </Link>
        <div className="hidden md:flex items-center gap-1">
          <Link to="/" className={buttonVariants({ variant: "ghost" })}>
            Home
          </Link>
          <Link to="/superskill" className={buttonVariants({ variant: "ghost" })}>
            Superskill
          </Link>
          <Link to="/docs/$" className={buttonVariants({ variant: "ghost" })}>
            Documentation
          </Link>
          <a
            href="https://github.com/powxenv/better-sol"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "ghost", isIconOnly: true })}
          >
            <GithubIcon />
          </a>
          <Button
            isIconOnly
            variant="ghost"
            onPress={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {resolvedTheme === "dark" ? (
              <SolarSunLineDuotone />
            ) : (
              <SolarMoonLineDuotone />
            )}
          </Button>
          {!isConnected ? (
            <Button isDisabled={!initialized} onClick={() => open()}>
              <SolarKeyMinimalisticLineDuotone />
              <span>Get API Keys</span>
            </Button>
          ) : (
            <>
              <Button onClick={() => open()} variant="outline">
                <SolarWalletMoneyLineDuotone />
                <span>{address?.slice(0, 6)}...</span>
              </Button>
              <Link to="/dash" className={buttonVariants()}>
                <SolarKeyMinimalisticLineDuotone />
                <span>API Keys</span>
              </Link>
            </>
          )}
        </div>
        <div className="flex md:hidden items-center gap-1">
          <Button
            isIconOnly
            variant="ghost"
            onPress={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {resolvedTheme === "dark" ? (
              <SolarSunLineDuotone />
            ) : (
              <SolarMoonLineDuotone />
            )}
          </Button>
          {!isConnected ? (
            <Button isDisabled={!initialized} onClick={() => open()} size="sm">
              <SolarKeyMinimalisticLineDuotone />
            </Button>
          ) : (
            <Button onClick={() => open()} variant="outline" size="sm">
              <SolarWalletMoneyLineDuotone />
              <span>{address?.slice(0, 4)}...</span>
            </Button>
          )}
          <Button
            isIconOnly
            variant="ghost"
            onPress={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <SolarCloseCircleLineDuotone />
            ) : (
              <SolarHamburgerMenuLineDuotone />
            )}
          </Button>
        </div>
      </div>
      {menuOpen && (
        <div className="inner border-x border-b bg-background md:hidden">
          <div className="flex flex-col gap-1 px-4 py-3">
            <Link
              to="/"
              className={buttonVariants({
                variant: "ghost",
                className: "justify-start",
              })}
              onClick={() => setMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              to="/superskill"
              className={buttonVariants({
                variant: "ghost",
                className: "justify-start",
              })}
              onClick={() => setMenuOpen(false)}
            >
              Superskill
            </Link>
            <Link
              to="/docs/$"
              className={buttonVariants({
                variant: "ghost",
                className: "justify-start",
              })}
              onClick={() => setMenuOpen(false)}
            >
              Documentation
            </Link>
            <a
              href="https://github.com/powxenv/better-sol"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                variant: "ghost",
                className: "justify-start",
              })}
              onClick={() => setMenuOpen(false)}
            >
              <GithubIcon /> GitHub
            </a>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;

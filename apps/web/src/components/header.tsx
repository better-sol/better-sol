import { Button, buttonVariants } from "@heroui/react";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitState,
} from "@reown/appkit/react";
import { Link } from "@tanstack/react-router";
import SolarWalletMoneyLineDuotone from "~icons/solar/wallet-money-line-duotone";
import SolarHomeSmileAngleLineDuotone from "~icons/solar/home-smile-angle-line-duotone";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveAccount } from "#/functions/account.functions";

const Header = () => {
  const { open } = useAppKit();
  const { initialized } = useAppKitState();
  const { isConnected, address } = useAppKitAccount();
  const saveAccountFn = useServerFn(saveAccount);

  useEffect(() => {
    if (isConnected && address) {
      saveAccountFn({ data: { address } });
    }
  }, [isConnected, address]);

  return (
    <header className="fixed top-0 inset-x-0 border-b z-10 bg-background/60 backdrop-blur-3xl">
      <div className="inner border-x px-8 h-14 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tighter">
          Better Sol
        </Link>
        <div className="flex items-center gap-1">
          <Link to="/" className={buttonVariants({ variant: "ghost" })}>
            Home
          </Link>
          <Link to="/" className={buttonVariants({ variant: "ghost" })}>
            Documentation
          </Link>
          <Link to="/" className={buttonVariants({ variant: "ghost" })}>
            AI / Superstack
          </Link>
          <Link to="/" className={buttonVariants({ variant: "ghost" })}>
            Blog
          </Link>
          {!isConnected ? (
            <Button isDisabled={!initialized} onClick={() => open()}>
              <SolarWalletMoneyLineDuotone />
              Sign In
            </Button>
          ) : (
            <>
              <Button onClick={() => open()} variant="outline">
                <SolarWalletMoneyLineDuotone />
                <span>{address?.slice(0, 6)}...</span>
              </Button>
              <Link to="/dash" className={buttonVariants()}>
                <SolarHomeSmileAngleLineDuotone />
                <span>Dashboard</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

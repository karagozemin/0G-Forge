#!/usr/bin/env node
import { Command } from "commander";
import { name as coreName } from "@og/core";

const program = new Command();

program
  .name("og")
  .description("Terminal-native companion for 0G App")
  .version("0.1.0");

program
  .command("doctor")
  .description("Validate basic monorepo wiring")
  .action(() => {
    console.log(`CLI bootstrapped. Core package: ${coreName}`);
  });

program.parse(process.argv);

import cliSpinners from "cli-spinners";
import chalk from "chalk";

export default function createSpinner(text: string = "") {
  const { frames, interval } = cliSpinners.dots;
  let i = 0;
  let timer: NodeJS.Timeout;

  const start = () => {
    timer = setInterval(() => {
      const frame = frames[(i = ++i % frames.length)];
      process.stdout.write(`\r${chalk.cyan(frame)} ${chalk.white(text)} `);
    }, interval);
  };

  const succeed = (message?: string) => {
    clearInterval(timer);
    process.stdout.write(
      `\r${chalk.green("✔")} ${chalk.white(message || text)}\n`
    );
  };

  const fail = (message?: string) => {
    clearInterval(timer);
    process.stdout.write(
      `\r${chalk.red("✖")} ${chalk.white(message || text)}\n`
    );
  };

  const update = (newText: string) => {
    text = newText;
  };

  const stop = () => {
    clearInterval(timer);
    process.stdout.write(`\r  ${chalk.white(text)}\n`);
  };

  const warn = (message?: string) => {
    clearInterval(timer);
    process.stdout.write(
      `\r${chalk.yellow("⚠")} ${chalk.white(message || text)}\n`
    );
  };

  start();

  return { succeed, fail, update, stop, warn };
}

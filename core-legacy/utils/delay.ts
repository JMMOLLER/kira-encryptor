/**
 * @description `[ENG]` Delay function to pause execution for a specified time.
 * @description `[ESP]` Función de retraso para pausar la ejecución durante un tiempo especificado.
 * @param ms - The number of milliseconds to delay
 */
export default function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

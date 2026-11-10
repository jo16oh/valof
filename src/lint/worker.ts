import {
  MessageChannel,
  parentPort,
  receiveMessageOnPort,
  Worker,
  workerData,
  type MessagePort,
} from "node:worker_threads";

/**
 * Asks a worker running `script` and blocks until it answers, for a caller that cannot be async.
 *
 * The thread blocks on `Atomics.wait` until the answer is in the port's queue, and
 * `receiveMessageOnPort` reads it without the event loop, which never gets a turn here. The port
 * and the signal go to the worker once, as it starts, so a question is all that each ask sends.
 *
 * The worker starts on the first question and answers the rest. One that does not answer within
 * `patience` milliseconds is stopped, and the next question starts another: a worker still busy
 * would leave every later question waiting behind it.
 */
export function connect<Question, Answer>(
  script: URL,
  patience: number,
): (question: Question) => Answer {
  let worker: { thread: Worker; port: MessagePort; signal: Int32Array } | undefined;
  return (question) => {
    if (!worker) {
      const { port1, port2 } = new MessageChannel();
      const signal = new Int32Array(new SharedArrayBuffer(4));
      const thread = new Worker(script, {
        workerData: { port: port2, signal },
        transferList: [port2],
      });
      // The host decides when it exits. A linter waiting on its own worker would never finish.
      thread.unref();
      worker = { thread, port: port1, signal };
    }

    const { thread, port, signal } = worker;
    Atomics.store(signal, 0, 0);
    thread.postMessage(question);
    if (Atomics.wait(signal, 0, 0, patience) === "timed-out") {
      void thread.terminate();
      worker = undefined;
      throw new Error(`valof-lint: no answer in ${patience / 1000}s`);
    }

    const answer = receiveMessageOnPort(port);
    if (!answer) throw new Error("valof-lint: the worker answered nothing");
    return answer.message as Answer;
  };
}

/**
 * Answers what {@link connect} asks, in the worker.
 *
 * `fail` makes the answer when `respond` throws, or when its answer cannot be sent: whatever
 * happened, the thread waiting on this has to receive something.
 */
export function serve<Question, Answer>(
  respond: (question: Question) => Promise<Answer>,
  fail: (error: unknown) => Answer,
): void {
  const { port, signal } = workerData as { port: MessagePort; signal: Int32Array };
  parentPort?.on("message", (question: Question) => {
    void respond(question)
      .catch(fail)
      .then((answer) => {
        try {
          port.postMessage(answer);
        } catch (error) {
          port.postMessage(fail(error));
        }
        Atomics.store(signal, 0, 1);
        Atomics.notify(signal, 0);
      });
  });
}

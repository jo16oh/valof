// @ts-expect-error -- the module is absent on purpose
import { thing } from "some-other-library";

export const Widget = thing().impl(() => ({
  render: () => null,
}));

type User = (Val<"User", { id: string }>);
const User = Val.sealer<((User))>();

export const user = Val.of<((User))>({ id: "1" });

type User = (Val<"User", { id: string }>);
const User = Val.companion<((User))>();

export const user = Val.of<((User))>({ id: "1" });

import { Money } from "../money.ts";

export const show = (money: Parameters<typeof Money.format>[0]) => Money.format(money);

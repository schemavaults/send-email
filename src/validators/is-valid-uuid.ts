import { z } from "zod";

export default function isValidUuid(val: unknown): val is string {
  return typeof val === "string" && z.string().safeParse(val).success;
}

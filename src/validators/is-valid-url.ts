import { string } from "zod";

export default function isValidUrl(val: unknown): val is string {
  return typeof val === "string" && string().url().safeParse(val).success;
}

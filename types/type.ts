import { snippetSchema } from "@/validiation/snippet-form-validiation";
import * as z from "zod";

export type SnippetFormValues = z.infer<typeof snippetSchema>;
/**
 * Mail-merge rendering.
 *
 * Templates use Handlebars-style tokens: {{firstName}}, {{practiceName}}, or any
 * custom column from an uploaded CSV, e.g. {{custom.region}}. Missing values
 * render empty (never "undefined").
 */
import Handlebars from "handlebars";
import type { Contact } from "@/lib/types";

// Escape HTML by default (Handlebars does this for {{ }}); no {{{ }}} raw output
// to keep injected contact data safe inside our email HTML.
Handlebars.registerHelper("default", (value: unknown, fallback: unknown) =>
  value === undefined || value === null || value === "" ? fallback : value
);

export interface MergeContext {
  firstName: string;
  lastName: string;
  email: string;
  practiceName: string;
  specialty: string;
  city: string;
  custom: Record<string, string>;
}

export function contactToMergeContext(contact: Contact): MergeContext {
  return {
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    email: contact.email,
    practiceName: contact.practiceName ?? "",
    specialty: contact.specialty ?? "",
    city: contact.city ?? "",
    custom: contact.custom ?? {},
  };
}

/** Compile once, render per recipient. Throws on malformed template syntax. */
export function compileTemplate(source: string): Handlebars.TemplateDelegate {
  return Handlebars.compile(source, { noEscape: false });
}

export function renderTemplate(source: string, ctx: MergeContext): string {
  return compileTemplate(source)(ctx);
}

/** Discover the merge tokens referenced by a template, for the UI's field list. */
export function extractTokens(source: string): string[] {
  const tokens = new Set<string>();
  const re = /\{\{\s*([#/]?)\s*([\w.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m[1]) continue; // skip block helpers like {{#if}}
    tokens.add(m[2]);
  }
  return [...tokens];
}

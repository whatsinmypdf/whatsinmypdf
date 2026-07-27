---
title: "Embedded JavaScript and Attached Files in a PDF: What They Actually Do"
description: A PDF can carry scripts and whole files inside it. What runs where, why your browser is stricter than Acrobat, and how to judge a finding without assuming the worst.
pubDate: 2026-07-27
---

A PDF is not a picture of a document. It is a container format, and two of the things it can contain surprise people: executable script, and entire other files.

Both are legitimate parts of the specification, both have ordinary uses, and both are worth knowing about before you open a file from a stranger — or hand one to a system that processes documents automatically.

## Embedded JavaScript

The PDF specification includes a scripting layer, originally Acrobat's. A document can run script when it opens, when a page is shown, when a form field changes, or when a button is clicked. The everyday use is forms: validating a date, calculating a total across fields, enabling a section once a box is ticked. That accounts for the large majority of PDFs containing JavaScript, and it is why a JavaScript finding on its own is weak evidence of anything.

What matters is which viewer opens the file, because they do not implement the same thing.

**Browsers implement a restricted subset.** Firefox renders PDFs with pdf.js and Chromium-family browsers use PDFium. Both support only a limited slice of the Acrobat JavaScript API, deliberately: the missing capabilities are absent by design rather than by oversight, and the projects treat "arbitrary Acrobat script does not run here" as intended behavior rather than a bug. Form scripting works; the wider API largely does not.

**Acrobat implements far more.** The full API reaches well beyond form arithmetic, and historically it is where PDF script has been most useful to an attacker. This is the practical reason the advice "open unknown PDFs in your browser, not in Acrobat" has survived for years: not because browsers are magic, but because they expose a much smaller surface.

**A viewer's script engine is still a parser.** Even a restricted engine is code processing untrusted input. Script-related vulnerabilities have been found in every major viewer, and the standard mitigation in enterprise settings is to disable PDF JavaScript entirely, which almost nothing an ordinary reader does actually needs.

So: JavaScript in a PDF you built from a form template is expected. JavaScript in a PDF that has no form fields, arrived unsolicited, and wants you to open it in Acrobat is worth a second look.

## Embedded files

A PDF can carry arbitrary files inside it — the specification calls them embedded file streams, and viewers usually surface them as attachments. The intended use is legitimate and sometimes genuinely useful: the source spreadsheet behind a report, a dataset alongside a paper, an XML rendition of an invoice. The ZUGFeRD and Factur-X electronic invoicing standards are built on exactly this, embedding a machine-readable XML invoice inside the human-readable PDF.

The security-relevant property is that an embedded file is a file that traveled inside another file. Anything scanning the outer document sees a PDF. The payload does not have to look like anything until it is extracted, and mail gateways and upload filters differ in how deeply they unpack containers. A PDF is also a much more welcome attachment than a `.zip` in most inboxes, which is the whole point for whoever chose the technique.

Nothing about an attachment executes on its own. Extraction is a user action, and running whatever comes out is a second one. The risk is a chain of ordinary steps, not a single automatic event — which is precisely why it works.

## How to judge a finding

The scanner reports both categories structurally: the file contains JavaScript, or the file contains embedded files, with the names it can read. That is a statement about what is in the container, not a claim about intent. Reading it well means asking three questions.

**Does the rest of the document explain it?** A PDF with fillable form fields and JavaScript is coherent. A one-page flyer with an open-action script is not.

**Where did it come from?** The same finding means different things in a file you generated from an invoicing system, a paper downloaded from arXiv, and an attachment from an address you do not recognize.

**What else did the scan find?** JavaScript alongside hidden text and an [injection phrase](/learn/pdf-prompt-injection) is a different document from JavaScript alone. Findings compound; that is why the report groups them rather than reducing everything to one score.

## What to do about a file you are unsure of

- **Open it in your browser** rather than in a full-featured desktop reader. The subset of script that runs there is much smaller.
- **Turn off PDF JavaScript in Acrobat** if you use it. Preferences → JavaScript → uncheck "Enable Acrobat JavaScript". Forms that genuinely need it will tell you.
- **Extract an attachment before you judge it,** and treat what comes out as its own file with its own risk — scan it the way you would scan anything else that arrived by email.
- **Do not rely on the file extension** of an embedded file. It is a label chosen by whoever built the PDF.
- **Keep your reader updated.** Most real-world PDF compromises have exploited a known, patched parser bug rather than anything exotic.

## Where this fits

Hidden text and hidden instructions are about what a document says to a machine that reads it. JavaScript and embedded files are about what a document carries. They are separate problems that arrive in the same container, and a structural scan reports both because the question a person actually has — "is there anything in this file I cannot see?" — does not distinguish between them.

For the full list of what a structural scan covers and where it is blind, see [ten places text can hide inside a PDF](/learn/10-places-text-can-hide-inside-a-pdf). To check a specific file, [drop it into the scanner](/); it runs in your browser and the file is not uploaded.

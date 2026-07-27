---
title: "Hidden Text in PDFs Exported from Word and Google Docs"
description: Where invisible text in an everyday exported PDF actually comes from — covered text, white fills, off-canvas objects, tracked changes — and how to find it before you send the file.
pubDate: 2026-07-27
---

Most hidden text in PDFs was not hidden on purpose. It is left over from the document it was exported from: a paragraph covered by an image, a line of white text on a white shape, a text box dragged off the canvas, a comment nobody resolved. None of it shows on the page. All of it is in the file you just emailed.

This matters more than it used to. A contract, a report, or a proposal now routinely passes through something that reads the text layer rather than looking at the page — a summarizer, a search index, a review assistant, a due-diligence tool. Whatever your export left behind gets read in full by all of them.

## Where it comes from

**Text covered by something opaque.** Putting a picture, a filled rectangle, or a white box over a paragraph hides it visually and does nothing to the text layer. The characters are still there, still extractable, still in reading order. This is the single most common source of surprise text in an exported PDF, because it looks like deletion and is not.

**White or near-white fills.** Text colored white on a white page, or light grey on white, disappears at reading distance while remaining fully present. Sometimes this is deliberate; more often it is a leftover from a template, or text that was highlighted and then had its highlight removed while keeping a white font colour.

**Objects moved off the page.** In Word and Google Docs, a floating text box or image can be dragged past the page boundary. It stops rendering. It does not stop existing. Design tools are worse for this — a Canva or Figma résumé template can carry an entire off-canvas layer of instructional text into the export.

**Word's hidden-text attribute.** Word has a font effect that marks text as hidden. By default it is excluded from printing and from PDF export, so this one usually behaves as expected. The exception is the "print hidden text" option: turn it on, export, and the text you deliberately hid is in the PDF. If you use this attribute to keep notes in a draft, check that setting before you export the final version.

**Tracked changes, comments, and speaker notes.** Deleted text under tracked changes, unresolved comments, and document metadata (author, company, previous filenames) can survive an export depending on the settings used. Google Docs suggestions behave the same way if the file is exported with them pending rather than accepted or rejected.

**Fonts that do not embed cleanly.** Occasionally an export produces text that renders as blank or as substituted glyphs while the underlying characters remain correct in the text layer. The page looks broken; the extracted text is fine. The reverse also happens, and it is why comparing the two is worth doing.

## How to find it before you send the file

The check takes under a minute and needs nothing installed.

**Select all and copy.** Open the exported PDF, press Ctrl/Cmd+A, copy, and paste into a plain text editor. Read what appears. Anything in the editor that you cannot find on the page is hidden text. This catches covered text, white text, and most off-page objects at once.

**Compare lengths.** For a long document, paste the extracted text into a word counter and compare against the source document's word count. A large gap in either direction is worth explaining.

**Run a structural scan.** Copy-paste has real limits: it usually misses text in layers that are switched off, and it will not tell you about embedded files, JavaScript, or annotation contents. [The scanner on this site](/) reads the file's structure rather than its rendered page and reports near-white text, invisible render mode, sub-point fonts, off-page text, crop-box mismatches, hidden layers, annotations, embedded files, and embedded JavaScript, each with a page number and the text itself. It runs in your browser, so a confidential draft is not uploaded anywhere.

The longer manual version of this, including `pdftotext` and how to turn on hidden layers by hand, is in [how to check a PDF for hidden text](/learn/how-to-check-a-pdf-for-hidden-text).

## How to actually remove it

Finding it is the easy part. Removing it properly means going back to the source document — the PDF is the output, and editing the output tends to leave the text in place while hiding it differently.

- **Delete, do not cover.** Remove the paragraph in the source file rather than putting a shape over it.
- **Accept or reject tracked changes** before exporting, and resolve or delete comments.
- **Check for off-canvas objects.** In Word, the selection pane lists every floating object on a page, including the ones you cannot see. In Google Docs, switching to print layout and scrolling the margins usually reveals them.
- **Strip metadata on the way out** if the recipient does not need it. Most export dialogs have a "document properties" or "remove personal information" option.
- **Re-export and re-check.** The point of the check is that it is cheap enough to run twice.

If you cannot go back to the source — someone sent you the PDF and you need a clean version — rasterizing the pages removes every text layer along with the hidden text, at the cost of making the document unsearchable and inaccessible to screen readers. That trade is rarely worth it. Fixing the source is.

## What clean means

A clean structural scan means the file's text layer and structure hold nothing you did not intend to send. It does not mean the document is safe in any broader sense: text baked into an image is invisible to this kind of check by design, and so is anything conveyed by the layout rather than the characters. What it does tell you is that the version a machine reads and the version a person reads are the same document — which, for anything you are about to sign, submit, or send to a client, is the property you actually wanted.

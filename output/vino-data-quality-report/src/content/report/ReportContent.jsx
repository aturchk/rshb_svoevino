import React from "react";

import {
  ChartRenderer,
  DataComponent,
  DataTable,
  MetricCard,
  ReportSection,
  RichNarrative,
  useDataApp,
} from "../../data-app-public.jsx";

const compactNumber = (value) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 });
const percent = (value) => `${(Number(value) * 100).toFixed(1)}%`;

const duplicateSpec = {
  type: "horizontalBar",
  x: "measure",
  y: "count",
  xLabel: "Rows",
  startAtZero: true,
  colors: ["var(--chart-1)"],
};

const mediaSpec = {
  type: "horizontalBar",
  x: "variant",
  y: "count",
  xLabel: "Files in one uploads tree",
  startAtZero: true,
  colors: ["var(--chart-2)"],
};

const linkageSpec = {
  type: "horizontalBar",
  x: "status",
  y: "photoNames",
  xLabel: "Distinct CSV photo names",
  startAtZero: true,
  colors: ["var(--chart-3)"],
};

const tableColumns = (pairs) => pairs.map(([field, label, presentation]) => ({
  field,
  label,
  ...(presentation ? { presentation } : {}),
}));

function EvidenceTable({ id, title, queryId, rows, columns, description, searchable = false }) {
  const { visible } = useDataApp();
  if (!visible(id)) return null;
  return (
    <DataComponent
      id={id}
      title={title}
      queryId={queryId}
      kind="table"
      displayRows={rows}
      sourceRows={rows}
      description={description}
    >
      <DataTable
        rows={rows}
        columns={columns}
        searchable={searchable}
        compactNumbers={false}
        label={title}
      />
    </DataComponent>
  );
}

function EvidenceBar({ id, title, queryId, rows, spec, description, height = 300 }) {
  const { visible, chartOverrides, chartProps } = useDataApp();
  if (!visible(id)) return null;
  const effectiveSpec = chartOverrides[id] ?? spec;
  return (
    <DataComponent
      id={id}
      title={title}
      queryId={queryId}
      kind="chart"
      chart={effectiveSpec}
      displayRows={rows}
      sourceRows={rows}
      description={description}
    >
      <ChartRenderer spec={effectiveSpec} rows={rows} height={height} {...chartProps(id)} />
    </DataComponent>
  );
}

export function ReportContent() {
  const {
    reviewedRows,
    visible,
    appTitle,
    setAppTitle,
    canEdit,
    mode,
  } = useDataApp();

  const csvProfile = reviewedRows("csv_profile");
  const csvSchema = reviewedRows("csv_schema_quality");
  const mediaInventory = reviewedRows("media_inventory");
  const mediaPackage = reviewedRows("media_package_summary");
  const linkage = reviewedRows("linkage_quality");
  const imageQuality = reviewedRows("image_quality");
  const collisions = reviewedRows("content_collisions");
  const evaluation = reviewedRows("eval_readiness");
  const issues = reviewedRows("issue_register");

  const rawRows = csvProfile.find((row) => row.measure === "Raw CSV rows")?.count ?? 0;
  const duplicateRows = csvProfile.find((row) => row.measure === "Exact duplicate rows")?.count ?? 0;
  const uniqueRows = csvProfile.find((row) => row.measure === "Unique catalog rows / slugs")?.count ?? 0;
  const deterministic = linkage.find((row) => row.status === "Deterministic filename match");
  const missingEval = evaluation.filter((row) => row.exactCatalogMatch === "No").length;

  const summarySources = {
    csv_profile: csvProfile,
    media_package_summary: mediaPackage,
    linkage_quality: linkage,
    content_collisions: collisions,
    eval_readiness: evaluation,
  };

  return (
    <article className="report-content vino-audit" aria-label="Wine dataset quality assessment">
      <header className="report-hero">
        <div className="report-kicker">DATA QUALITY ASSESSMENT · RSHB DIGITAL</div>
        <h1
          data-data-app-title
          contentEditable={canEdit && mode === "edit"}
          suppressContentEditableWarning
          aria-label={canEdit && mode === "edit" ? "Edit report heading" : undefined}
          onBlur={canEdit && mode === "edit" ? (event) => setAppTitle(event.currentTarget.textContent.trim() || appTitle) : undefined}
          onKeyDown={canEdit && mode === "edit" ? (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          } : undefined}
        >
          {appTitle}
        </h1>
        <RichNarrative
          id="report:description"
          value="Audit of the supplied catalog CSV, two Strapi media archives, three public evaluation photos, and the technical brief. The question is not whether useful material exists—it does—but whether the package can support trustworthy training and evaluation as delivered."
          className="report-deck"
          label="Edit report introduction"
        />
      </header>

      {visible("evidence-overview") && (
        <ReportSection
          id="evidence-overview"
          title="Executive Summary"
          queryId="csv_profile"
          queryIds={["csv_profile", "media_package_summary", "linkage_quality", "content_collisions", "eval_readiness"]}
          sourceRowsByQuery={summarySources}
          showHeading={false}
          className="report-summary"
        >
          <RichNarrative
            id="evidence-overview:body"
            className="report-summary-lead"
            label="Edit executive summary"
            value={`## Executive Summary\n\n- **Do not train or score a final system directly from this package.** The usable core is a catalog of ${compactNumber(uniqueRows)} distinct slugs, but it has no authoritative relation from catalog record to physical asset or verified image label.\n\n- **The CSV is almost exactly doubled.** ${compactNumber(duplicateRows)} of ${compactNumber(rawRows)} rows (${percent(duplicateRows / rawRows)}) are exact duplicates.\n\n- **Filename cleanup does not solve the join.** Normalization yields one technical asset match for ${compactNumber(deterministic?.photoNames ?? 0)} of 2,090 distinct photo names (${percent(deterministic?.share ?? 0)}), while 445 names remain ambiguous or unresolved. Even matched files include 18 byte-identical image groups spanning 37 different slugs.\n\n- **The supplied evaluation material cannot validate the required accuracy.** It has three public query photos and no public ground-truth slug file; ${missingEval} of the three visible products have no exact row in the supplied CSV.`}
          />
        </ReportSection>
      )}

      <div className="report-facts report-facts-four" aria-label="Key audit results">
        {visible("metric-unique-records") && (
          <MetricCard id="metric-unique-records" title="Usable catalog grain" queryId="csv_profile"
            sourceRows={csvProfile} value={`${compactNumber(uniqueRows)} slugs`}
            description="Exact-deduplicated catalog rows; not yet verified image labels." />
        )}
        {visible("metric-duplicate-share") && (
          <MetricCard id="metric-duplicate-share" title="Exact duplicate rows" queryId="csv_profile"
            sourceRows={csvProfile} value={percent(duplicateRows / rawRows)}
            description="Duplicates across all nine CSV columns." />
        )}
        {visible("metric-linkage") && (
          <MetricCard id="metric-linkage" title="Deterministic name linkage" queryId="linkage_quality"
            sourceRows={linkage} value={percent(deterministic?.share ?? 0)}
            description="Heuristic technical match; not semantic label verification." />
        )}
        {visible("metric-eval-gap") && (
          <MetricCard id="metric-eval-gap" title="Visible eval products absent" queryId="eval_readiness"
            sourceRows={evaluation} value={`${missingEval} of ${evaluation.length}`}
            description="Manual exact-product comparison with the supplied CSV." />
        )}
      </div>

      <section className="report-section">
        <ReportSection id="csv-diagnosis" title="The CSV is a catalog export, not a labeled image manifest" queryId="csv_profile"
          queryIds={["csv_profile", "csv_schema_quality"]}
          sourceRowsByQuery={{ csv_profile: csvProfile, csv_schema_quality: csvSchema }} showHeading={false}>
          <RichNarrative id="csv-diagnosis:body" className="report-analysis" label="Edit CSV diagnosis"
            value={`## The CSV is a catalog export, not a labeled image manifest\n\nThe most defensible row grain is **one product slug** after exact deduplication. That leaves ${compactNumber(uniqueRows)} records from ${compactNumber(rawRows)} source rows. This is recoverable with a deterministic deduplication step, but it shows that the export was not prepared for modeling.\n\nThe deeper schema issue is the absence of an immutable asset ID, authoritative storage path, media hash, vintage field, label identifier, and split assignment. The filename in **Название фото** is presentation metadata, not a foreign key. Underscores, spaces, Cyrillic text, and Strapi suffixes can be normalized; semantic ambiguity and missing relations cannot.`} />
        </ReportSection>
        <EvidenceBar id="csv-row-integrity-chart" title="The raw row count is split almost evenly between duplicates and unique records"
          queryId="csv_profile"
          rows={csvProfile.filter((row) => ["Exact duplicate rows", "Unique catalog rows / slugs"].includes(row.measure))}
          spec={duplicateSpec}
          description="Exact row duplication across every supplied CSV field. The two bars reconcile to 4,147 raw rows."
          height={230} />
        <EvidenceTable id="schema-quality-table" title="Schema checks show low missingness but weak standardization"
          queryId="csv_schema_quality" rows={csvSchema}
          columns={tableColumns([["check", "Check"], ["affected", "Affected"], ["rate", "Share", "percent"], ["severity", "Severity", "status"]])}
          description="Checks use the 2,103 exact-deduplicated catalog records. Rows may overlap across checks." />
      </section>

      <section className="report-section">
        <ReportSection id="media-diagnosis" title="The media package is two copies of an uncurated site archive" queryId="media_inventory"
          queryIds={["media_inventory", "media_package_summary"]}
          sourceRowsByQuery={{ media_inventory: mediaInventory, media_package_summary: mediaPackage }} showHeading={false}>
          <RichNarrative id="media-diagnosis:body" className="report-analysis" label="Edit media diagnosis"
            value="## The media package is two copies of an uncurated site archive\n\nEach supplied uploads tree contains **15,803 files / 2.10 GiB**. Their relative filenames and every corresponding byte size agree, so the package contains a duplicate archive. Within one tree, only 6,241 files are originals or non-resize assets; 9,562 are Strapi thumbnails or size variants. The archive also mixes product media with article, tour, map, XML, PDF, TIFF, SVG, HEIC, and other site assets.\n\nThis is consistent with a filesystem dump. It is useful as raw material, but it is not a training set and should not be sampled by walking the directory." />
        </ReportSection>
        <EvidenceBar id="media-variant-chart" title="Resize derivatives make up most files in each uploads tree"
          queryId="media_inventory" rows={mediaInventory} spec={mediaSpec}
          description="Filename prefixes classify Strapi-derived variants. “Original / other” still includes unrelated non-product assets."
          height={330} />
        <EvidenceTable id="media-package-table" title="Both supplied media trees have the same inventory"
          queryId="media_package_summary" rows={mediaPackage}
          columns={tableColumns([["tree", "Tree"], ["files", "Files"], ["gib", "Size (GiB)"]])}
          description="Identity was established from relative filename sets and per-file byte sizes; this is not a complete cryptographic comparison of all 4.19 GiB." />
      </section>

      <section className="report-section">
        <ReportSection id="linkage-diagnosis" title="Filename normalization recovers many links, but not ground truth" queryId="linkage_quality"
          queryIds={["linkage_quality", "content_collisions"]}
          sourceRowsByQuery={{ linkage_quality: linkage, content_collisions: collisions }} showHeading={false}>
          <RichNarrative id="linkage-diagnosis:body" className="report-analysis" label="Edit linkage diagnosis"
            value="## Filename normalization recovers many links, but not ground truth\n\nRemoving resize prefixes, Strapi’s trailing ten-character asset token, punctuation, case, and separator differences produces a unique technical match for **1,645 of 2,090 photo names**. Another 28 names point to multiple asset hashes and 417 do not resolve by that method. Some unresolved cases may be recoverable through transliteration or manual lookup, so they are a linkage backlog—not automatically missing files.\n\nThe more serious defect appears after linkage: **18 SHA-256 groups span 37 distinct slugs**. Some pairs represent different varieties, products, or vintages. For an image-only model, a byte-identical input cannot truthfully carry two mutually exclusive exact-product labels. Those records need product-level adjudication before training." />
        </ReportSection>
        <EvidenceBar id="linkage-status-chart" title="One in five CSV photo names remains unresolved by normalized filename"
          queryId="linkage_quality" rows={linkage} spec={linkageSpec}
          description="Technical filename reconciliation only. A unique match does not prove that the depicted wine is correct."
          height={265} />
        <EvidenceTable id="collision-examples-table" title="Examples of byte-identical imagery across different catalog records"
          queryId="content_collisions" rows={collisions}
          columns={tableColumns([["example", "Example group"], ["distinctSlugs", "Slugs"], ["risk", "Why it matters"]])}
          description="Illustrative groups from 18 total cross-slug SHA-256 collisions; the companion notebook retains the reproducible check." />
      </section>

      <section className="report-section">
        <ReportSection id="image-fitness" title="The linked assets are references, not representative scan training data" queryId="image_quality" showHeading={false}>
          <RichNarrative id="image-fitness:body" className="report-analysis" label="Edit image-fitness diagnosis"
            value="## The linked assets are references, not representative scan training data\n\nAll 1,645 deterministically linked originals decoded successfully, but **68.3% are below 512 px on at least one side**, **91.8% carry an alpha channel**, and **12.6% are more than four times taller than wide**. These indicators overlap. They describe a collection dominated by isolated bottle/product cutouts.\n\nThe public queries are 3,024 × 4,032 mobile photographs with shelves, glare, perspective, occlusion, and competing bottles. That domain gap matters more than nominal image count: training only on clean product cutouts does not reproduce the deployed visual problem." />
        </ReportSection>
        <EvidenceTable id="image-quality-table" title="Reference-image flags relevant to mobile shelf recognition"
          queryId="image_quality" rows={imageQuality}
          columns={tableColumns([["check", "Indicator"], ["images", "Images"], ["share", "Share", "percent"]])}
          description="Overlapping flags among 1,645 deterministically linked originals; percentages must not be summed." />
      </section>

      <section className="report-section">
        <ReportSection id="eval-diagnosis" title="The public evaluation package tests the API shape, not model quality" queryId="eval_readiness" showHeading={false}>
          <RichNarrative id="eval-diagnosis:body" className="report-analysis" label="Edit evaluation diagnosis"
            value={`## The public evaluation package tests the API shape, not model quality\n\nThe checksum manifest is valid and the supplied script clearly defines a sequential multipart request, the image field, accepted response shapes, and a ten-second client timeout. That is enough to test integration.\n\nIt is not enough to estimate accuracy: there are only ${evaluation.length} public photos, no public expected-slug column, and ${missingEval} visible product identities have no exact CSV record. The challenge may use hidden labels, but with the supplied package alone the team cannot reproduce top-1, top-5, recall, F1, or the brief’s 90–100% target.`} />
        </ReportSection>
        <EvidenceTable id="eval-readiness-table" title="Manual comparison of visible evaluation labels with the supplied catalog"
          queryId="eval_readiness" rows={evaluation}
          columns={tableColumns([["file", "Query file"], ["visibleProduct", "Visible product"], ["exactCatalogMatch", "Exact CSV match", "status"], ["finding", "Finding"]])}
          description="Manual image reading, not hidden competition ground truth. Exact-match absence is a catalog-version signal, not proof that the evaluator lacks a private label." />
      </section>

      <section className="report-section">
        <ReportSection id="severity-diagnosis" title="What is actually wrong, ranked by downstream impact" queryId="issue_register" showHeading={false}>
          <RichNarrative id="severity-diagnosis:body" className="report-analysis" label="Edit severity interpretation"
            value="## What is actually wrong, ranked by downstream impact\n\nThe criticism that “there is effectively no dataset” is directionally correct for training and evaluation, but it should be stated precisely. There **is** valuable catalog metadata and reference imagery. What is absent is the curated relation that turns those materials into supervised examples: one authoritative product ID, one verified image identity, explicit ambiguity handling, and a representative labeled benchmark." />
        </ReportSection>
        <EvidenceTable id="issue-register-table" title="Issue register" queryId="issue_register" rows={issues}
          columns={tableColumns([["finding", "Finding"], ["classification", "Type"], ["severity", "Severity", "status"], ["confidence", "Confidence", "status"], ["evidence", "Evidence"], ["downstreamRisk", "Downstream risk"]])}
          searchable
          description="Severity is assigned for the exact-wine mobile-recognition use case in the supplied brief." />
      </section>

      <section className="report-section remediation-section">
        <RichNarrative id="remediation:body" className="report-analysis" label="Edit remediation plan"
          value="## The minimum path to a defensible dataset\n\n1. **Freeze one catalog version.** Deduplicate by slug, define the canonical product ID, and add explicit vintage and package/label-variant fields.\n\n2. **Build an authoritative asset manifest.** For every candidate original, store product ID, slug, asset path, SHA-256, source, image role, verification state, and exclusion reason. Resolve ambiguous/unmatched filenames manually; do not infer labels silently.\n\n3. **Adjudicate collisions and near-duplicates.** Decide whether shared images are legitimate packaging equivalence, stale catalog mapping, wrong media, or impossible-to-distinguish targets. Exclude unresolved contradictions.\n\n4. **Create a real benchmark before model selection.** Label a materially larger set of mobile photographs, including clutter, glare, rotation, crops, multiple bottles, label redesigns, vintages, and hard negatives. Split by physical image/product family so derivatives and duplicates cannot leak across train and validation.\n\n5. **Train from curated evidence, not the dump.** The supplied cutouts are useful as retrieval references and for synthetic augmentation, but field photos and verified labels must control validation. Report top-1 accuracy and recall directly; define any F1 calculation because “top-k F1” is not self-defining.\n\nThe first concrete deliverable should be the manifest and adjudication queue. Model architecture work before that would optimize against unknown labels and an unmeasurable test." />
      </section>

      <section className="report-section methods-section">
        <ReportSection id="methods-and-limits" title="Methods and limits" queryId="issue_register"
          queryIds={["csv_profile", "csv_schema_quality", "media_inventory", "media_package_summary", "linkage_quality", "image_quality", "content_collisions", "eval_readiness", "issue_register"]}
          sourceRowsByQuery={{ csv_profile: csvProfile, csv_schema_quality: csvSchema, media_inventory: mediaInventory,
            media_package_summary: mediaPackage, linkage_quality: linkage, image_quality: imageQuality,
            content_collisions: collisions, eval_readiness: evaluation, issue_register: issues }} showHeading={false}>
          <RichNarrative id="methods-and-limits:body" className="report-disclosure" label="Edit methods and limits"
            value="## Methods and limits\n\nCSV checks cover every supplied row. Media inventory covers both complete uploads trees. Filename linkage is a documented heuristic, so unresolved references are not automatically missing and deterministic links are not automatically semantically correct. Image decoding and SHA-256 collision checks cover the 1,645 deterministically linked originals. The two media trees were compared by complete relative filename sets and per-file sizes; a full digest comparison of both 2.10 GiB trees was not necessary to establish the packaging duplication used in this report. Evaluation-label comparisons are manual observations from the three public images, not the organizer’s hidden ground truth. No model was trained, and no accuracy estimate is claimed." />
        </ReportSection>
      </section>
    </article>
  );
}

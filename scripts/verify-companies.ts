/** Checks every ATS slug in data/companies.json and reports boards that don't resolve. */
import { loadSeedCompanies } from "../src/lib/ingest/companies";
import { isStudentRole } from "../src/lib/ingest/classify";
import { mapLimit } from "../src/lib/ingest/fetch";
import { fetchCompanyBoard } from "../src/lib/ingest/sources";

async function main() {
  const companies = loadSeedCompanies();
  const results = await mapLimit(companies, 6, async (c) => {
    try {
      const postings = await fetchCompanyBoard(c);
      const student = postings.filter((p) => isStudentRole(p.title, p.employmentTypeHint)).length;
      return { ...c, ok: true as const, total: postings.length, student };
    } catch (err) {
      return { ...c, ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });
  for (const r of results) {
    const status = r.ok
      ? `ok  ${String(r.total).padStart(4)} jobs, ${r.student} student`
      : `FAIL ${r.error}`;
    console.log(`${r.ats.padEnd(10)} ${r.atsSlug.padEnd(24)} ${status}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} boards resolved.`);
  if (failed.length) process.exitCode = 1;
}

main();

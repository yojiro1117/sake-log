import { readFile } from 'node:fs/promises';

const reportPath = 'test-results/playwright-report.json';
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const failures = [];

collectSuites(report.suites ?? [], []);
if (failures.length === 0) {
  console.log('::error::Playwright failed without a recorded test failure. Inspect the uploaded report artifact.');
} else {
  for (const failure of failures.slice(0, 12)) {
    console.log(`::error::${escapeAnnotation(`${failure.title} [${failure.project}] - ${failure.message}`)}`);
  }
}
process.exitCode = 1;

function collectSuites(suites, parents) {
  for (const suite of suites) {
    const path = [...parents, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const failedResults = (test.results ?? []).filter((result) => result.status !== 'passed' && result.status !== 'skipped');
        if (!failedResults.length) continue;
        const finalResult = failedResults.at(-1);
        failures.push({
          title:[...path, spec.title].join(' > '),
          project:test.projectName ?? 'unknown project',
          message:finalResult?.errors?.map((error) => error.message).filter(Boolean).join(' | ') || finalResult?.status || 'failed'
        });
      }
    }
    collectSuites(suite.suites ?? [], path);
  }
}

function escapeAnnotation(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A').slice(0, 7000);
}

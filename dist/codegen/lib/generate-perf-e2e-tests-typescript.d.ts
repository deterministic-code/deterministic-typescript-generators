export declare function generatePerfE2eTestTypescript(): string;
/** Self-describing catalog `perf_e2e_tests` (typescript): the perf e2e client that replays performance-plan.yaml against a running backend. The `--output` already resolves to the `__tests__` dir, so the file is placed by basename. */
export declare function generate(): Promise<{
    files: {
        path: string;
        content: string;
    }[];
}>;

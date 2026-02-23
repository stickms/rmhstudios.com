export interface OAProblem {
    id: string;
    title: string;
    difficulty: 'Mandatory';
    complexityRequirement: string;
    gameReference: string;
    description: string;
    examples: { input: string; output: string; explanation: string }[];
    constraints: string[];
    starterCode: Record<string, string>;
    timeLimit: 15;
}

export const problemBank: OAProblem[] = [
    {
        id: 'rmh-eats-optimal-route',
        title: 'RMH Eats Optimal Route',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n²)',
        gameReference: 'RMH Eats',
        description: `# RMH Eats Optimal Route

You are a delivery driver for **RMH Eats**. You have been assigned **N** restaurants to pick up orders from before returning to the delivery hub.

Given a list of N restaurants and the distances between every pair of restaurants (and the hub), find the **shortest route** that starts at the hub, visits every restaurant **exactly once**, and returns to the hub.

**Required Time Complexity:** Your solution **must** run in **O(n²)** time.

**Required Space Complexity:** O(n)

> Note: Approximate solutions are not accepted. Your route must be provably optimal.`,
        examples: [
            {
                input: 'n = 4\ndistances = [\n  [0, 10, 15, 20],\n  [10, 0, 35, 25],\n  [15, 35, 0, 30],\n  [20, 25, 30, 0]\n]',
                output: '80',
                explanation: 'The optimal route is: Hub → 0 → 1 → 3 → 2 → Hub with total distance 80.',
            },
        ],
        constraints: [
            '2 ≤ n ≤ 100,000',
            'All distances are positive integers ≤ 10^9',
            'The distance matrix is symmetric',
            'Your solution MUST run in O(n²) time',
            'Approximate or heuristic solutions will be rejected',
        ],
        starterCode: {
            javascript: `/**
 * @param {number} n - Number of restaurants
 * @param {number[][]} distances - Distance matrix (n x n)
 * @return {number} - Minimum total distance of optimal route
 */
function findOptimalRoute(n, distances) {
    // Your O(n²) solution here
    
}`,
            python: `def find_optimal_route(n: int, distances: list[list[int]]) -> int:
    """
    Find the shortest route visiting all n restaurants and returning to hub.
    Must run in O(n²) time.
    """
    pass`,
            typescript: `function findOptimalRoute(n: number, distances: number[][]): number {
    // Your O(n²) solution here
    
}`,
        },
        timeLimit: 15,
    },
    {
        id: 'signal-forge-circuit-sat',
        title: 'Signal Forge Circuit Verification',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n)',
        gameReference: 'Signal Forge',
        description: `# Signal Forge Circuit Verification

The **Signal Forge** has generated a corrupted boolean circuit consisting of AND, OR, and NOT gates. Your task is to determine whether there exists **any input assignment** that causes the circuit to output TRUE.

You are given a directed acyclic graph representing the circuit. Each node is either:
- An **INPUT** gate (no predecessors)
- An **AND** gate (outputs TRUE iff all inputs are TRUE)
- An **OR** gate (outputs TRUE iff at least one input is TRUE)
- A **NOT** gate (inverts its single input)

The final gate is the circuit output.

**Required Time Complexity:** Your solution **must** run in **O(n)** time, where n is the number of gates.

> The integrity of the Signal Forge depends on this. No pressure.`,
        examples: [
            {
                input: 'gates = [\n  { type: "INPUT", id: 0 },\n  { type: "INPUT", id: 1 },\n  { type: "AND", id: 2, inputs: [0, 1] },\n  { type: "NOT", id: 3, inputs: [2] }\n]\noutput_gate = 3',
                output: 'true',
                explanation: 'Setting input 0 = false, input 1 = false: AND(false, false) = false, NOT(false) = true.',
            },
        ],
        constraints: [
            '1 ≤ n ≤ 1,000,000 gates',
            'The circuit is a DAG (no cycles)',
            'Exactly one output gate',
            'Your solution MUST run in O(n) time',
            'Return true if ANY satisfying assignment exists, false otherwise',
        ],
        starterCode: {
            javascript: `/**
 * @param {Object[]} gates - Array of gate objects with type, id, and inputs
 * @param {number} outputGate - ID of the output gate
 * @return {boolean} - Whether a satisfying input assignment exists
 */
function isCircuitSatisfiable(gates, outputGate) {
    // Your O(n) solution here
    
}`,
            python: `def is_circuit_satisfiable(gates: list[dict], output_gate: int) -> bool:
    """
    Determine if any input assignment makes the circuit output TRUE.
    Must run in O(n) time.
    """
    pass`,
            typescript: `interface Gate {
    type: 'INPUT' | 'AND' | 'OR' | 'NOT';
    id: number;
    inputs?: number[];
}

function isCircuitSatisfiable(gates: Gate[], outputGate: number): boolean {
    // Your O(n) solution here
    
}`,
        },
        timeLimit: 15,
    },
    {
        id: 'neon-driftway-graph-coloring',
        title: 'Neon Driftway Graph Coloring',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n + m)',
        gameReference: 'Neon Driftway',
        description: `# Neon Driftway Graph Coloring

The **Neon Driftway** track is represented as a graph where each node is a track segment and each edge connects adjacent segments. For aesthetic reasons, no two adjacent segments may share the same neon color.

Given the track graph, determine the **minimum number of colors** (the chromatic number) needed to color all segments such that no two adjacent segments share a color.

**Required Time Complexity:** Your solution **must** run in **O(n + m)** time, where n = segments and m = adjacencies.

> The Neon Driftway Racing League demands precision. Approximate answers will result in immediate disqualification.`,
        examples: [
            {
                input: 'n = 5\nedges = [[0,1], [1,2], [2,3], [3,4], [4,0]]',
                output: '3',
                explanation: 'A 5-cycle (odd cycle) requires 3 colors. No 2-coloring is possible.',
            },
        ],
        constraints: [
            '1 ≤ n ≤ 500,000',
            '0 ≤ m ≤ 2,000,000',
            'The graph is simple (no self-loops or multi-edges)',
            'Your solution MUST run in O(n + m) time',
            'Return the exact chromatic number, not an upper bound',
        ],
        starterCode: {
            javascript: `/**
 * @param {number} n - Number of track segments
 * @param {number[][]} edges - Adjacency list as pairs [u, v]
 * @return {number} - Minimum number of colors (chromatic number)
 */
function findChromaticNumber(n, edges) {
    // Your O(n + m) solution here
    
}`,
            python: `def find_chromatic_number(n: int, edges: list[list[int]]) -> int:
    """
    Find the minimum number of colors to color the track graph.
    Must run in O(n + m) time.
    """
    pass`,
            typescript: `function findChromaticNumber(n: number, edges: number[][]): number {
    // Your O(n + m) solution here
    
}`,
        },
        timeLimit: 15,
    },
    {
        id: 'echoes-clique-detection',
        title: 'Echoes of the Spire Clique Detection',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n²)',
        gameReference: 'Echoes of the Spire',
        description: `# Echoes of the Spire — Maximum Clique

In the world of **Echoes of the Spire**, explorers form alliances. Given a social network where nodes represent explorers and edges represent mutual trust, find the **largest group (clique)** where every member trusts every other member.

Return the size of the maximum clique.

**Required Time Complexity:** Your solution **must** run in **O(n²)** time.

> The Spire rewards only the most tightly bonded groups. Loose alliances will be consumed by the echoes.`,
        examples: [
            {
                input: 'n = 5\nedges = [[0,1], [0,2], [1,2], [1,3], [2,3], [3,4]]',
                output: '3',
                explanation: 'The largest clique is {0, 1, 2} or {1, 2, 3}, each of size 3.',
            },
        ],
        constraints: [
            '1 ≤ n ≤ 100,000',
            '0 ≤ m ≤ 1,000,000',
            'The graph is undirected and simple',
            'Your solution MUST run in O(n²) time',
            'Return the exact size of the maximum clique',
        ],
        starterCode: {
            javascript: `/**
 * @param {number} n - Number of explorers
 * @param {number[][]} edges - Trust connections as pairs [u, v]
 * @return {number} - Size of the largest clique
 */
function findMaxClique(n, edges) {
    // Your O(n²) solution here
    
}`,
            python: `def find_max_clique(n: int, edges: list[list[int]]) -> int:
    """
    Find the size of the maximum clique in the explorer network.
    Must run in O(n²) time.
    """
    pass`,
            typescript: `function findMaxClique(n: number, edges: number[][]): number {
    // Your O(n²) solution here
    
}`,
        },
        timeLimit: 15,
    },
    {
        id: 'laundry-sort-partition',
        title: 'Laundry Sort Partition',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n log n)',
        gameReference: 'Laundry Sort',
        description: `# Laundry Sort — Equal Weight Partition

In **Laundry Sort**, you have a pile of laundry items, each with a positive integer weight. Determine whether the pile can be divided into **exactly two groups** of **equal total weight**.

**Required Time Complexity:** Your solution **must** run in **O(n log n)** time.

**Required Space Complexity:** O(n)

> The Laundry Sort physics engine demands perfectly balanced loads. Your washing machine will explode otherwise.`,
        examples: [
            {
                input: 'weights = [1, 5, 11, 5]',
                output: 'true',
                explanation: 'The items can be split into {1, 5, 5} (sum = 11) and {11} (sum = 11).',
            },
            {
                input: 'weights = [1, 2, 3, 5]',
                output: 'false',
                explanation: 'Total weight is 11 (odd), so equal partition is impossible.',
            },
        ],
        constraints: [
            '1 ≤ n ≤ 10,000,000',
            '1 ≤ weights[i] ≤ 10^18',
            'Your solution MUST run in O(n log n) time',
            'Dynamic programming approaches exceeding this complexity will be rejected',
        ],
        starterCode: {
            javascript: `/**
 * @param {number[]} weights - Array of laundry item weights
 * @return {boolean} - Whether the items can be split into two equal-weight groups
 */
function canPartition(weights) {
    // Your O(n log n) solution here
    
}`,
            python: `def can_partition(weights: list[int]) -> bool:
    """
    Determine if laundry items can be split into two equal-weight groups.
    Must run in O(n log n) time.
    """
    pass`,
            typescript: `function canPartition(weights: number[]): boolean {
    // Your O(n log n) solution here
    
}`,
        },
        timeLimit: 15,
    },
    {
        id: 'synapse-storm-scheduling',
        title: 'Synapse Storm Task Scheduling',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n log n)',
        gameReference: 'Synapse Storm',
        description: `# Synapse Storm — Optimal Task Scheduling

In **Synapse Storm**, you must schedule **N** micro-challenges across **M** identical neural processors. Each challenge has a duration, a deadline, and a penalty if missed.

Find the assignment of challenges to processors that **minimizes total penalty**. A challenge incurs its penalty if it finishes after its deadline.

**Required Time Complexity:** Your solution **must** run in **O(n log n)** time.

> The Synapse Storm waits for no one. Suboptimal scheduling will result in neural cascade failure.`,
        examples: [
            {
                input: 'tasks = [{duration: 2, deadline: 3, penalty: 10}, {duration: 1, deadline: 2, penalty: 20}, {duration: 3, deadline: 5, penalty: 5}]\nprocessors = 2',
                output: '0',
                explanation: 'Processor 1: task 1 (finishes at 1, before deadline 2). Processor 2: task 0 (finishes at 2, before deadline 3), then task 2 (finishes at 5, at deadline 5). Total penalty: 0.',
            },
        ],
        constraints: [
            '1 ≤ n ≤ 1,000,000',
            '1 ≤ m ≤ 100,000',
            '1 ≤ duration[i] ≤ 10^9',
            '1 ≤ deadline[i] ≤ 10^18',
            '0 ≤ penalty[i] ≤ 10^9',
            'Your solution MUST run in O(n log n) time',
            'Return the minimum possible total penalty',
        ],
        starterCode: {
            javascript: `/**
 * @param {Object[]} tasks - Array of {duration, deadline, penalty}
 * @param {number} processors - Number of available processors
 * @return {number} - Minimum total penalty
 */
function minPenalty(tasks, processors) {
    // Your O(n log n) solution here
    
}`,
            python: `def min_penalty(tasks: list[dict], processors: int) -> int:
    """
    Schedule tasks on processors to minimize total penalty.
    Must run in O(n log n) time.
    """
    pass`,
            typescript: `interface Task {
    duration: number;
    deadline: number;
    penalty: number;
}

function minPenalty(tasks: Task[], processors: number): number {
    // Your O(n log n) solution here
    
}`,
        },
        timeLimit: 15,
    },
    {
        id: 'cursed-logic-3sat',
        title: 'Cursed Logic Formula',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n × m)',
        gameReference: 'Cursed Logic',
        description: `# Cursed Logic — Formula Satisfiability

The **AI Protocol** in Cursed Logic has generated a boolean formula in Conjunctive Normal Form (CNF). Each clause contains exactly 3 literals. Your task is to find a satisfying assignment — values for each boolean variable such that every clause has at least one TRUE literal.

Given n variables and m clauses, find a satisfying assignment or determine that none exists.

**Required Time Complexity:** Your solution **must** run in **O(n × m)** time.

> The Protocol is watching. The Protocol is always watching.`,
        examples: [
            {
                input: 'n = 3  // variables: x1, x2, x3\nclauses = [\n  [1, -2, 3],    // (x1 OR NOT x2 OR x3)\n  [-1, 2, -3],   // (NOT x1 OR x2 OR NOT x3)\n  [1, 2, 3]      // (x1 OR x2 OR x3)\n]',
                output: '[true, true, true]',
                explanation: 'x1=true, x2=true, x3=true satisfies all clauses.',
            },
        ],
        constraints: [
            '1 ≤ n ≤ 1,000,000 variables',
            '1 ≤ m ≤ 5,000,000 clauses',
            'Each clause has exactly 3 literals',
            'Literals are integers: positive = variable, negative = negation',
            'Your solution MUST run in O(n × m) time',
            'Return any valid assignment or null if unsatisfiable',
        ],
        starterCode: {
            javascript: `/**
 * @param {number} n - Number of boolean variables
 * @param {number[][]} clauses - Array of clauses, each with 3 literals
 * @return {boolean[]|null} - Satisfying assignment or null if impossible
 */
function solve3SAT(n, clauses) {
    // Your O(n × m) solution here
    
}`,
            python: `def solve_3sat(n: int, clauses: list[list[int]]) -> list[bool] | None:
    """
    Find a satisfying assignment for a 3-CNF formula.
    Must run in O(n × m) time.
    """
    pass`,
            typescript: `function solve3SAT(n: number, clauses: number[][]): boolean[] | null {
    // Your O(n × m) solution here
    
}`,
        },
        timeLimit: 15,
    },
    {
        id: 'rmh-code-dependency-resolution',
        title: 'RMH Code Dependency Resolution',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n)',
        gameReference: 'RMH Code',
        description: `# RMH Code — Dependency Resolution

**RMH Code** needs to resolve package dependencies. You are given a set of packages, each with a list of version ranges it supports for its dependencies. Determine if there exists a compatible set of versions — one version per package — such that all dependency constraints are simultaneously satisfied.

Each package has multiple available versions, and each version may depend on specific version ranges of other packages.

**Required Time Complexity:** Your solution **must** run in **O(n)** time, where n is the total number of packages + constraints.

> RMH Code users are waiting. The build must not fail.`,
        examples: [
            {
                input: 'packages = {\n  "react": ["17.0.0", "18.0.0"],\n  "react-dom": ["17.0.0", "18.0.0"]\n}\ndeps = {\n  "react-dom@17.0.0": {"react": "17.0.0"},\n  "react-dom@18.0.0": {"react": "18.0.0"}\n}',
                output: '{"react": "18.0.0", "react-dom": "18.0.0"}',
                explanation: 'react-dom@18.0.0 requires react@18.0.0. Both are available.',
            },
        ],
        constraints: [
            '1 ≤ number of packages ≤ 500,000',
            '1 ≤ versions per package ≤ 100',
            'Your solution MUST run in O(n) time',
            'Return any valid resolution or null if no compatible set exists',
        ],
        starterCode: {
            javascript: `/**
 * @param {Object} packages - Map of package name to available versions
 * @param {Object} deps - Map of "pkg@version" to dependency constraints
 * @return {Object|null} - Map of package name to chosen version, or null
 */
function resolveDependencies(packages, deps) {
    // Your O(n) solution here
    
}`,
            python: `def resolve_dependencies(packages: dict, deps: dict) -> dict | None:
    """
    Find a compatible set of package versions satisfying all constraints.
    Must run in O(n) time.
    """
    pass`,
            typescript: `function resolveDependencies(
    packages: Record<string, string[]>,
    deps: Record<string, Record<string, string>>
): Record<string, string> | null {
    // Your O(n) solution here
    
}`,
        },
        timeLimit: 15,
    },
    {
        id: 'house-always-wins-hamiltonian',
        title: 'House Always Wins — Hamiltonian Path',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n + m)',
        gameReference: 'House Always Wins',
        description: `# House Always Wins — Hamiltonian Path

The cursed casino in **House Always Wins** has a floor plan represented as an undirected graph, where each room is a node and each hallway is an edge. To break the curse, you must find a path that visits **every room exactly once**.

Given the floor plan, find a Hamiltonian path or determine that none exists.

**Required Time Complexity:** Your solution **must** run in **O(n + m)** time.

> The House always wins. But maybe today, you can at least find the exit.`,
        examples: [
            {
                input: 'n = 4\nedges = [[0,1], [1,2], [2,3], [0,3], [0,2]]',
                output: '[0, 1, 2, 3]',
                explanation: 'The path 0 → 1 → 2 → 3 visits all rooms exactly once.',
            },
        ],
        constraints: [
            '1 ≤ n ≤ 1,000,000',
            '0 ≤ m ≤ 5,000,000',
            'The graph is undirected and simple',
            'Your solution MUST run in O(n + m) time',
            'Return the path as an ordered list of room IDs, or null if impossible',
        ],
        starterCode: {
            javascript: `/**
 * @param {number} n - Number of rooms
 * @param {number[][]} edges - Hallway connections as pairs [u, v]
 * @return {number[]|null} - Hamiltonian path or null if none exists
 */
function findHamiltonianPath(n, edges) {
    // Your O(n + m) solution here
    
}`,
            python: `def find_hamiltonian_path(n: int, edges: list[list[int]]) -> list[int] | None:
    """
    Find a path visiting every room exactly once.
    Must run in O(n + m) time.
    """
    pass`,
            typescript: `function findHamiltonianPath(n: number, edges: number[][]): number[] | null {
    // Your O(n + m) solution here
    
}`,
        },
        timeLimit: 15,
    },
    {
        id: 'temple-of-joy-knapsack',
        title: 'Temple of Joy Offering Selection',
        difficulty: 'Mandatory',
        complexityRequirement: 'O(n)',
        gameReference: 'Temple of Joy',
        description: `# Temple of Joy — Optimal Offering Selection

The **Temple of Joy** accepts offerings. Each offering has a **weight** and a **joy value**. Your sacred knapsack has a maximum weight capacity **W**.

Select a subset of offerings that maximizes total joy without exceeding the weight limit. Each offering can only be taken once (0/1 selection).

**Required Time Complexity:** Your solution **must** run in **O(n)** time, where n is the number of offerings.

**Required Space Complexity:** O(n)

> The Temple demands efficiency. The gods do not wait for exponential algorithms.`,
        examples: [
            {
                input: 'capacity = 10\nofferings = [\n  {weight: 5, joy: 10},\n  {weight: 4, joy: 40},\n  {weight: 6, joy: 30},\n  {weight: 3, joy: 50}\n]',
                output: '90',
                explanation: 'Select offerings with joy 40 (weight 4) and joy 50 (weight 3) for total joy 90, total weight 7 ≤ 10.',
            },
        ],
        constraints: [
            '1 ≤ n ≤ 10,000,000',
            '1 ≤ W ≤ 10^18',
            '1 ≤ weight[i] ≤ 10^9',
            '1 ≤ joy[i] ≤ 10^9',
            'Your solution MUST run in O(n) time',
            'No approximation algorithms accepted — exact optimal solution required',
        ],
        starterCode: {
            javascript: `/**
 * @param {number} capacity - Maximum knapsack weight
 * @param {Object[]} offerings - Array of {weight, joy}
 * @return {number} - Maximum total joy achievable
 */
function maxJoy(capacity, offerings) {
    // Your O(n) solution here
    
}`,
            python: `def max_joy(capacity: int, offerings: list[dict]) -> int:
    """
    Select offerings to maximize joy within weight capacity.
    Must run in O(n) time. Exact solution required.
    """
    pass`,
            typescript: `interface Offering {
    weight: number;
    joy: number;
}

function maxJoy(capacity: number, offerings: Offering[]): number {
    // Your O(n) solution here
    
}`,
        },
        timeLimit: 15,
    },
];

export function getRandomProblem(): OAProblem {
    return problemBank[Math.floor(Math.random() * problemBank.length)];
}

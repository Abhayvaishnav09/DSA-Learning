export type CodeLanguage = 'python' | 'pseudocode';

export interface Example {
  id: string;
  language: CodeLanguage;
  title: { en: string; 'hi-Latn': string };
  code: string;
}

/** Starting points for the visualize screen. Each one is checked by the tests. */
export const EXAMPLES: Example[] = [
  {
    id: 'linear-search',
    language: 'python',
    title: { en: 'Linear search: find_paper()', 'hi-Latn': 'Linear search: find_paper()' },
    code: `def find_paper(papers, name):
    for p in papers:
        if p == name:
            return True
    return False

papers = ["Alice", "Bob", "Charlie", "David", "Emma",
          "Frank", "Grace", "Hannah", "Ian", "Jack"]

target = "Emma"
result = find_paper(papers, target)
print(f"Is '{target}' in papers list? {result}")
`,
  },
  {
    id: 'binary-search',
    language: 'python',
    title: { en: 'Binary search', 'hi-Latn': 'Binary search' },
    code: `def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1

nums = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
print(binary_search(nums, 23))
`,
  },
  {
    id: 'bubble-sort',
    language: 'python',
    title: { en: 'Bubble sort', 'hi-Latn': 'Bubble sort' },
    code: `nums = [5, 1, 4, 2, 8]
n = len(nums)
for i in range(n):
    for j in range(n - 1 - i):
        if nums[j] > nums[j + 1]:
            nums[j], nums[j + 1] = nums[j + 1], nums[j]
print(nums)
`,
  },
  {
    id: 'insertion-sort',
    language: 'python',
    title: { en: 'Insertion sort', 'hi-Latn': 'Insertion sort' },
    code: `nums = [7, 3, 9, 1, 5]
for i in range(1, len(nums)):
    key = nums[i]
    j = i - 1
    while j >= 0 and nums[j] > key:
        nums[j + 1] = nums[j]
        j -= 1
    nums[j + 1] = key
print(nums)
`,
  },
  {
    id: 'fibonacci',
    language: 'python',
    title: { en: 'Fibonacci (recursion)', 'hi-Latn': 'Fibonacci (recursion)' },
    code: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(5))
`,
  },
  {
    id: 'largest',
    language: 'python',
    title: { en: 'Largest number in a list', 'hi-Latn': 'List ka sabse bada number' },
    code: `marks = [67, 82, 45, 91, 78]
best = marks[0]
for m in marks:
    if m > best:
        best = m
print("Highest marks:", best)
`,
  },
  {
    id: 'pseudo-search',
    language: 'pseudocode',
    title: { en: 'Search a list (pseudocode)', 'hi-Latn': 'List me dhoondho (pseudocode)' },
    code: `papers = ["Alice", "Bob", "Cara", "Dev"]
define find(papers, name):
    for each p in papers:
        if p == name:
            return true
    return false
say find(papers, "Cara")
`,
  },
];

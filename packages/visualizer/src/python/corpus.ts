/**
 * Programs the way students write them, with the textbook answer for each. The tests run every
 * one through the recogniser, the derivation and the measurement and check all three agree.
 */
export interface CorpusProgram {
  id: string;
  /** detect.ts id, or null when no named algorithm should be claimed. */
  algorithm: string | null;
  worst: string;
  best: string;
  code: string;
  /** What counting lines shows when it cannot see the true growth (say why next to it). */
  measured?: string;
}

export const CORPUS: CorpusProgram[] = [
  {
    id: 'linear-search',
    algorithm: 'linear-search',
    worst: 'O(n)',
    best: 'O(1)',
    code: `def find(nums, target):
    for i in range(len(nums)):
        if nums[i] == target:
            return i
    return -1

nums = [4, 8, 15, 16, 23, 42]
print(find(nums, 23))
`,
  },
  {
    id: 'binary-search',
    algorithm: 'binary-search',
    worst: 'O(log n)',
    best: 'O(1)',
    code: `def search(arr, target):
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

print(search([1, 3, 5, 7, 9, 11, 13], 11))
`,
  },
  {
    id: 'binary-search-recursive',
    algorithm: 'binary-search',
    worst: 'O(log n)',
    best: 'O(1)',
    code: `def bs(arr, target, lo, hi):
    if lo > hi:
        return -1
    mid = (lo + hi) // 2
    if arr[mid] == target:
        return mid
    if arr[mid] < target:
        return bs(arr, target, mid + 1, hi)
    return bs(arr, target, lo, mid - 1)

arr = [2, 4, 6, 8, 10, 12, 14, 16]
print(bs(arr, 14, 0, len(arr) - 1))
`,
  },
  {
    id: 'bubble-sort-early-exit',
    algorithm: 'bubble-sort',
    worst: 'O(n²)',
    best: 'O(n)',
    code: `def bubble(a):
    n = len(a)
    for i in range(n):
        swapped = False
        for j in range(n - 1 - i):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
                swapped = True
        if not swapped:
            break
    return a

print(bubble([5, 1, 4, 2, 8]))
`,
  },
  {
    id: 'selection-sort',
    algorithm: 'selection-sort',
    worst: 'O(n²)',
    best: 'O(n²)',
    code: `a = [64, 25, 12, 22, 11]
for i in range(len(a)):
    m = i
    for j in range(i + 1, len(a)):
        if a[j] < a[m]:
            m = j
    a[i], a[m] = a[m], a[i]
print(a)
`,
  },
  {
    id: 'insertion-sort',
    algorithm: 'insertion-sort',
    worst: 'O(n²)',
    best: 'O(n)',
    code: `a = [12, 11, 13, 5, 6]
for i in range(1, len(a)):
    key = a[i]
    j = i - 1
    while j >= 0 and a[j] > key:
        a[j + 1] = a[j]
        j -= 1
    a[j + 1] = key
print(a)
`,
  },
  {
    id: 'merge-sort',
    algorithm: 'merge-sort',
    worst: 'O(n log n)',
    best: 'O(n log n)',
    code: `def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    out = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i])
            i += 1
        else:
            out.append(right[j])
            j += 1
    out.extend(left[i:])
    out.extend(right[j:])
    return out

print(merge_sort([38, 27, 43, 3, 9, 82, 10]))
`,
  },
  {
    id: 'quick-sort',
    algorithm: 'quick-sort',
    worst: 'O(n²)',
    best: 'O(n log n)',
    code: `def quick(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[0]
    smaller = [x for x in arr[1:] if x < pivot]
    bigger = [x for x in arr[1:] if x >= pivot]
    return quick(smaller) + [pivot] + quick(bigger)

print(quick([3, 6, 1, 8, 2, 9, 4]))
`,
  },
  {
    id: 'largest',
    algorithm: 'find-extreme',
    worst: 'O(n)',
    best: 'O(n)',
    code: `marks = [67, 82, 45, 91, 78]
best = marks[0]
for m in marks:
    if m > best:
        best = m
print(best)
`,
  },
  {
    id: 'sum',
    algorithm: 'accumulate',
    worst: 'O(n)',
    best: 'O(n)',
    code: `nums = [3, 1, 4, 1, 5]
total = 0
for x in nums:
    total += x
print(total)
`,
  },
  {
    id: 'two-sum-pairs',
    algorithm: 'nested-loops',
    worst: 'O(n²)',
    best: 'O(n²)',
    code: `nums = [2, 7, 11, 15, 1, 8]
count = 0
for a in nums:
    for b in nums:
        if a + b == 9:
            count += 1
print(count)
`,
  },
  {
    id: 'two-pointers',
    algorithm: 'two-pointers',
    worst: 'O(n)',
    best: 'O(1)',
    code: `def is_palindrome(s):
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True

print(is_palindrome("racecar"))
`,
  },
  {
    id: 'sliding-window',
    algorithm: 'sliding-window',
    worst: 'O(n)',
    best: 'O(n)',
    code: `def max_window(a, k):
    window = sum(a[:k])
    best = window
    for i in range(k, len(a)):
        window += a[i]
        window -= a[i - k]
        best = max(best, window)
    return best

print(max_window([1, 4, 2, 10, 2, 3, 1, 0, 20], 4))
`,
  },
  {
    id: 'prefix-sum',
    algorithm: 'prefix-sum',
    worst: 'O(n)',
    best: 'O(n)',
    code: `nums = [3, 1, 4, 1, 5, 9]
prefix = [0] * (len(nums) + 1)
for i in range(len(nums)):
    prefix[i + 1] = prefix[i] + nums[i]
print(prefix)
`,
  },
  {
    id: 'hashing',
    algorithm: 'hashing',
    worst: 'O(n)',
    best: 'O(n)',
    code: `words = ["a", "b", "a", "c", "b", "a"]
count = {}
for w in words:
    count[w] = count.get(w, 0) + 1
print(count)
`,
  },
  {
    id: 'stack',
    algorithm: 'stack',
    worst: 'O(n)',
    // A closing bracket first ends it at once.
    best: 'O(1)',
    code: `def balanced(s):
    stack = []
    pairs = {")": "(", "]": "["}
    for ch in s:
        if ch in "([":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack

print(balanced("([()])"))
`,
  },
  {
    id: 'bfs',
    algorithm: 'bfs',
    worst: 'O(V + E)',
    best: 'O(V + E)',
    code: `from collections import deque

graph = {1: [2, 3], 2: [4], 3: [4], 4: []}
seen = {1}
queue = deque([1])
order = []
while queue:
    node = queue.popleft()
    order.append(node)
    for nb in graph[node]:
        if nb not in seen:
            seen.add(nb)
            queue.append(nb)
print(order)
`,
  },
  {
    id: 'dfs',
    algorithm: 'dfs',
    worst: 'O(V + E)',
    best: 'O(V + E)',
    code: `graph = {"A": ["B", "C"], "B": ["D"], "C": ["D"], "D": []}
visited = set()

def dfs(node):
    visited.add(node)
    for nb in graph[node]:
        if nb not in visited:
            dfs(nb)

dfs("A")
print(len(visited))
`,
  },
  {
    id: 'fibonacci',
    algorithm: 'branching-recursion',
    worst: 'O(2ⁿ)',
    best: 'O(2ⁿ)',
    code: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(8))
`,
  },
  {
    id: 'fibonacci-memo',
    algorithm: 'memoization',
    worst: 'O(n)',
    best: 'O(n)',
    code: `memo = {}

def fib(n):
    if n < 2:
        return n
    if n in memo:
        return memo[n]
    memo[n] = fib(n - 1) + fib(n - 2)
    return memo[n]

print(fib(30))
`,
  },
  {
    id: 'factorial',
    algorithm: 'recursion',
    worst: 'O(n)',
    best: 'O(n)',
    code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(6))
`,
  },
  {
    id: 'dp-climb',
    algorithm: 'dynamic-programming',
    worst: 'O(n)',
    best: 'O(n)',
    code: `n = 10
dp = [0] * (n + 1)
dp[0] = 1
dp[1] = 1
for i in range(2, n + 1):
    dp[i] = dp[i - 1] + dp[i - 2]
print(dp[n])
`,
  },
  {
    id: 'kadane',
    algorithm: 'kadane',
    worst: 'O(n)',
    best: 'O(n)',
    code: `nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]
cur = best = nums[0]
for x in nums[1:]:
    cur = max(x, cur + x)
    best = max(best, cur)
print(best)
`,
  },
  {
    id: 'gcd',
    algorithm: 'gcd',
    worst: 'O(log n)',
    best: 'O(log n)',
    code: `def gcd(a, b):
    while b:
        a, b = b, a % b
    return a

print(gcd(48, 18))
`,
    // gcd(n, n) finishes at once: the measured sizes never reach Euclid's worst case.
    measured: 'O(1)',
  },
  {
    id: 'prime-check',
    algorithm: 'prime-check',
    worst: 'O(√n)',
    best: 'O(1)',
    code: `def is_prime(n):
    if n < 2:
        return False
    i = 2
    while i * i <= n:
        if n % i == 0:
            return False
        i += 1
    return True

print(is_prime(97))
`,
  },
  {
    id: 'sieve',
    algorithm: 'sieve',
    worst: 'O(n log log n)',
    best: 'O(n log log n)',
    code: `n = 30
is_prime = [True] * (n + 1)
is_prime[0] = is_prime[1] = False
for i in range(2, n + 1):
    if is_prime[i]:
        for j in range(i * i, n + 1, i):
            is_prime[j] = False
print([i for i in range(n + 1) if is_prime[i]])
`,
  },
  {
    id: 'fast-power',
    algorithm: 'fast-power',
    worst: 'O(log n)',
    best: 'O(log n)',
    code: `def power(base, exp):
    result = 1
    while exp > 0:
        if exp % 2 == 1:
            result *= base
        base *= base
        exp //= 2
    return result

print(power(3, 13))
`,
  },
  {
    id: 'hidden-sort',
    algorithm: null,
    worst: 'O(n log n)',
    best: 'O(n log n)',
    code: `nums = [5, 3, 9, 1, 7]
nums.sort()
for x in nums:
    print(x)
`,
    // sort() runs inside Python itself, so counting lines sees only the O(n) loop.
    measured: 'O(n)',
  },
  {
    id: 'hidden-in',
    algorithm: null,
    worst: 'O(n²)',
    best: 'O(n²)',
    code: `a = [1, 2, 3, 4, 5, 6]
b = [4, 5, 6, 7, 8, 9]
common = []
for x in a:
    if x in b:
        common.append(x)
print(common)
`,
    // "x in b" walks b inside Python: lines alone would say O(n).
    measured: 'O(n)',
  },
  {
    id: 'input-driven',
    algorithm: 'find-extreme',
    worst: 'O(n)',
    best: 'O(n)',
    code: `n = int(input())
nums = list(map(int, input().split()))
best = nums[0]
for x in nums:
    if x > best:
        best = x
print(best)
`,
  },
  {
    id: 'function-only',
    algorithm: 'linear-search',
    worst: 'O(n)',
    best: 'O(1)',
    code: `def contains(items, wanted):
    for item in items:
        if item == wanted:
            return True
    return False
`,
  },
];

# setup-pulumi

Github Action. Starts Pulumi in CI environment. See workflow examples [here](./.github/workflows/)

## Usage

```yaml
name: Test

on:
  push:
    branches:
      - master

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v1
      with:
        fetch-depth: 1
    - uses: cloudlayerio/github-pulumi@master
      with:
        stack: dev
        args: up
        root: example
        github-token: ${{ secrets.GITHUB_TOKEN }}
        comment-on-pr: 1
      env:
        PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
        GOOGLE_CREDENTIALS: ${{ secrets.GOOGLE_CREDENTIALS }}
```

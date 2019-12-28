# Pulumi GitHub Action
**This is not designed for public consumption, I would suggest forking this if you stumble upon it as this will be changed to suit our needs and not focusing on stability at this time**

## Parameters
- stack : Name of the pulumi stack to use.
- root : Path of your source root.
- download-auth-only : Does not execute pulumi, only downloads and authenticates pulumi for running outside of action. This is useful if you want to have the action do all the prep work but need finer control.
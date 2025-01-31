# AuthKit JavaScript Library

This library can be used to interface with AuthKit in a client-side JavaScript
application.

## Installation

```
npm install @workos-inc/authkit-js
```

## Usage

```js
import { createClient } from "@workos-inc/authkit-js";
const authkit = await createClient("your-client-id");
const user = authkit.getUser();
const accessToken = await authkit.getAccessToken();
```

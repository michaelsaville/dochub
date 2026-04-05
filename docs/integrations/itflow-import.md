# ITFlow CSV Import

DocHub includes a guided import wizard that lets you migrate your data out of ITFlow in a single session. The wizard handles clients, contacts, assets, credentials, and licenses — each as a separate pass.

**The import is a one-time migration tool.** There is no ongoing live sync with ITFlow. Once your data is in DocHub it carries the `ITFLOW` data source tag and is managed from that point forward inside DocHub.

---

## Overview

The import follows a five-step wizard for each data type:

1. **Select entity type** — choose what you're importing
2. **Upload CSV** — drag-and-drop or file-pick your ITFlow export
3. **Map columns** — tell DocHub which CSV column corresponds to which field
4. **Map companies** — match ITFlow company names to DocHub clients (fuzzy-matched automatically)
5. **Preview & import** — review each row's action before committing

Navigate to **Import** in the DocHub sidebar to begin.

---

## Recommended import order

Import in this sequence to avoid missing references:

1. **Clients** — must exist before anything else can be linked to them
2. **Contacts**
3. **Assets**
4. **Credentials**
5. **Licenses**

---

## Exporting from ITFlow

All export options are under **Admin → Export** in your ITFlow instance. Each export produces a `.csv` file.

> ITFlow column names vary slightly between versions. The column mapping step in DocHub lets you handle any naming differences — you are never required to rename your CSV headers.

### Clients

`Admin → Export → Clients`

Relevant columns to map:

| DocHub field | Typical ITFlow column | Required |
|---|---|---|
| Client Name | `client_name` | Yes |
| Address | `client_address` | |
| City | `client_city` | |
| State | `client_state` | |
| ZIP / Postcode | `client_zip` | |
| Notes | `client_notes` | |

### Contacts

`Admin → Export → Contacts`

| DocHub field | Typical ITFlow column | Required |
|---|---|---|
| Company (ITFlow) | `contact_company` | Yes |
| Contact Name | `contact_name` | Yes |
| Title / Role | `contact_title` | |
| Email | `contact_email` | |
| Phone | `contact_phone` | |
| Mobile | `contact_mobile` | |
| Notes | `contact_notes` | |

### Assets (Devices)

`Admin → Export → Assets` (may be labelled "Devices" in older versions)

| DocHub field | Typical ITFlow column | Required |
|---|---|---|
| Company (ITFlow) | `device_company` | Yes |
| Asset Name | `device_name` | Yes |
| Type / Category | `device_type` | |
| Make / Manufacturer | `device_manufacturer` | |
| Model | `device_model` | |
| Serial Number | `device_serial` | |
| IP Address | `device_ip` | |
| MAC Address | `device_mac` | |
| Notes | `device_notes` | |

**Asset type mapping** — DocHub auto-maps ITFlow type strings to its internal categories:

| If ITFlow type contains… | DocHub category |
|---|---|
| server | Server |
| nas, storage | NAS |
| laptop, notebook | Laptop |
| desktop, computer, workstation | Computer / Desktop |
| tablet, ipad | Tablet |
| switch | Network Gear |
| firewall, router, network | Network Gear |
| access point, ap, wifi, wireless | Wireless |
| printer, mfp | Printer |
| phone, pbx, voip | Phone System |
| vpn | VPN |
| *(anything else)* | Other |

### Passwords / Credentials

`Admin → Export → Passwords`

> Passwords are exported in **plaintext** by ITFlow. DocHub re-encrypts them immediately on import using its own vault key. The plaintext values are never stored.

| DocHub field | Typical ITFlow column | Required |
|---|---|---|
| Company (ITFlow) | `password_company` | Yes |
| Name / Label | `password_name` | Yes |
| Username | `password_username` | |
| Password | `password_password` | |
| URL | `password_url` | |
| Notes | `password_notes` | |

### Licenses

`Admin → Export → Licenses` (may be "Software Licenses")

| DocHub field | Typical ITFlow column | Required |
|---|---|---|
| Company (ITFlow) | `license_company` | Yes |
| License Name | `license_name` | Yes |
| License Key | `license_key` | |
| Seats / Quantity | `license_seats` | |
| Renewal Date | `license_expiry` | |
| Notes | `license_notes` | |

---

## Step-by-step walkthrough

### Step 1 — Select entity type

Pick what you are importing from the list. You will run the wizard once per type.

### Step 2 — Upload CSV

Drag your exported `.csv` onto the upload area or click to browse. DocHub parses it in-browser — nothing is uploaded to the server at this stage.

The parser handles standard RFC 4180 CSV including quoted fields and embedded commas.

### Step 3 — Map columns

DocHub shows every field it expects for that entity type. For each field, select the matching column from your CSV using the dropdown. A live preview shows the first few values from that column so you can verify the mapping is correct.

Only fields marked **Required** must be mapped. All others are optional.

### Step 4 — Map companies (contacts, assets, credentials, licenses only)

DocHub scans every unique company name in the CSV and attempts to match each one to an existing DocHub client using fuzzy matching.

**How fuzzy matching works:**
- Company name suffixes (LLC, Inc, Ltd, Corp, etc.) are stripped before comparison
- Non-alphanumeric characters are removed
- Matches are scored using bigram similarity
- Scores above 0.85 are auto-suggested as high-confidence matches
- Scores between 0.3 and 0.85 are listed as lower-confidence suggestions
- You can override any suggestion or choose "Skip" to exclude that company's rows

For each ITFlow company name you can:
- Accept the suggested DocHub client
- Choose a different client from the dropdown
- Set to **Skip** — all rows for that company will be excluded from the import

### Step 5 — Preview

DocHub renders every row with its proposed action:

| Action | Meaning |
|---|---|
| **Create** | Row will be imported as a new record |
| **Skip** | Row is excluded (either manually or because no client was matched) |

For the **Clients** entity type specifically, you can also:
- **Match to existing** — select an existing DocHub client to mark this row as already present (prevents a duplicate being created)

Review the full list, adjust any row actions if needed, then click **Import**.

### Import results

After the import completes, DocHub reports:

- **Created** — number of records successfully created
- **Skipped** — number of rows excluded (missing required fields, action set to skip, or already matched)
- **Errors** — any rows that failed with a specific reason

---

## What gets created

### Clients
- A `Client` record with name and notes
- If address data is present, a `Location` record named "Main Office" is created automatically

### Contacts
- A `Contact` record linked to the matched client
- Fields: name, role, email, phone, mobile, notes

### Assets
- An `Asset` record linked to the matched client
- DocHub uses the client's first active location; if none exists, a "Main Office" location is created automatically
- `dataSource` is set to `ITFLOW`
- Category is inferred from the type string (see mapping table above)

### Credentials
- A `Credential` record linked to the matched client
- The password is **encrypted immediately** using AES-256 before being written to the database
- `dataSource` is set to `ITFLOW`

### Licenses
- A `License` record linked to the matched client
- `dataSource` is set to `ITFLOW`
- Renewal date is parsed from the CSV value; invalid or blank dates are stored as null

---

## Tips and common issues

**Duplicate clients** — run the Clients import first and use "Match to existing" for any client names that already exist in DocHub. This ensures contacts, assets, etc. land on the right client.

**Company name mismatches** — if ITFlow uses a trading name and DocHub has the legal name (or vice versa), the fuzzy matcher may score low. Use the dropdown on step 4 to manually select the correct client.

**Character encoding** — export from ITFlow using UTF-8 encoding if your ITFlow instance supports it. Windows-1252 exports may garble special characters in names and notes.

**Large exports** — the CSV is parsed in-browser. Files up to ~50,000 rows work well. Very large files may be slow to preview; consider splitting by client or by date range if needed.

**Passwords with commas** — ITFlow wraps fields containing commas in double-quotes. DocHub's CSV parser handles this correctly.

**Running the import multiple times** — the import always creates new records; it does not check for duplicates within a single run or against previous runs. If you import the same file twice, you will get duplicate records. Only run each import once.

---

## After the import

- Records imported from ITFlow appear with the ITFlow source badge (favicon) in all list views
- You can edit or delete any imported record normally — the `ITFLOW` source tag is informational only
- Credentials can be revealed and rotated like any other credential in the vault
- Assets can be enriched with additional fields (RDP/VNC settings, driver URL, Splashtop link, etc.)

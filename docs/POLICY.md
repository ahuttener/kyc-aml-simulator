# KYC and AML Onboarding Policy

**Project:** KYC Onboarding and Screening Simulator
**Author:** Adriano Huttener
**Version:** 1.0 (November 2026)
**Status:** Educational policy written for a portfolio project. It models how a regulated firm in Ireland would design its customer onboarding controls. It is not legal advice.

---

## 1. Purpose

This policy sets out how the simulator onboards new customers, screens them against sanctions and politically exposed person (PEP) lists, scores their money laundering and terrorist financing (ML/TF) risk, and decides whether to approve, reject or escalate each case.

Every automated rule in the simulator maps to a section of this policy, and every section of this policy maps to the law that requires it. The goal is traceability: a reviewer should be able to pick any decision in the case queue and follow it back to a legal obligation.

## 2. Legal and regulatory framework

| Instrument | What it covers | How the simulator uses it |
|---|---|---|
| Criminal Justice (Money Laundering and Terrorist Financing) Act 2010, as amended in 2013, 2018 and 2021 ("CJA 2010") | Irish law that transposes the EU AML Directives. Applies to "designated persons" such as credit and financial institutions. | Main reference for every control below. |
| Directive (EU) 2015/849 (4th AML Directive), as amended by Directive (EU) 2018/843 (5th AML Directive) | Current EU framework that the CJA 2010 implements. | Source of the risk based approach, PEP rules and high risk third country rules. |
| Regulation (EU) 2024/1624 (AMLR) and Directive (EU) 2024/1640 (AMLD6) | New EU "single rulebook". The AMLR applies directly in every Member State from 10 July 2027. AMLD6 repeals the 4th Directive from the same date. | Noted as the future baseline. The design keeps human review of every final decision, which the new rulebook expects for onboarding decisions. |
| Regulation (EU) 2024/1620 (AMLA Regulation) | Creates the EU Anti Money Laundering Authority (AMLA), based in Frankfurt. | Context only. |
| Delegated Regulation (EU) 2016/1675, as amended | EU list of high risk third countries with strategic AML deficiencies. | Drives mandatory enhanced due diligence for those countries. The list in the simulator is an illustrative subset and must be checked against the current version. |
| EU restrictive measures (financial sanctions) | EU consolidated list of persons, groups and entities subject to asset freezes. | Sanctions screening. The simulator ships with fictional sample data and can import the real list as CSV. |
| Central Bank of Ireland, Guidelines on AML/CFT for the Financial Sector | Supervisory expectations on risk assessment, CDD and monitoring. | Shapes the risk scoring and periodic review cycle. |

## 3. Key definitions

* **CDD (Customer Due Diligence):** identifying the customer and verifying that identity using documents or data from a reliable and independent source (CJA 2010, s.33).
* **Beneficial owner (UBO):** the natural person who ultimately owns or controls a company. For corporate customers this is normally any individual holding more than 25% of the shares or voting rights, or otherwise exercising control.
* **SDD (Simplified Due Diligence):** reduced measures that may be applied only where the business relationship presents a lower degree of risk (CJA 2010, s.34A).
* **EDD (Enhanced Due Diligence):** additional measures applied where risk is higher (CJA 2010, ss.37, 38A and 39).
* **PEP (Politically Exposed Person):** an individual who is or has been entrusted with a prominent public function, together with their immediate family members and close associates (CJA 2010, s.37).
* **Sanctions screening:** checking customers and UBOs against financial sanctions lists before onboarding and on an ongoing basis.
* **MLRO:** Money Laundering Reporting Officer, the senior person responsible for escalations and suspicious transaction reporting.

## 4. Risk based approach

The CJA 2010 requires a designated person to assess the ML/TF risk of its business (s.30A) and to apply that assessment when deciding the extent of CDD for each customer (s.30B). The simulator implements this as a points based customer risk score.

### 4.1 Risk factors and weights

| Factor | Condition | Points | Legal basis |
|---|---|---|---|
| Customer type | Individual | 0 | s.30B |
| | Sole trader | 5 | s.30B |
| | Company | 10 | s.30B, s.33 (UBO verification) |
| | Trust or complex structure | 20 | s.30B, Schedule 4 higher risk factors |
| Geography | EU or EEA country | 0 | s.30B |
| | Non EU or EEA country | 10 | s.30B |
| | EU high risk third country | 40 and mandatory EDD | s.38A |
| Industry | High risk sector (money services, crypto assets, gambling, precious metals and stones, cash intensive business, arms) | 15 | s.30B, Schedule 4 |
| PEP | Customer or UBO is a PEP, family member or close associate | 30 and mandatory EDD | s.37 |
| Ownership transparency | Company with no beneficial owner identified | 25 and CDD cannot be completed | s.33 |
| Expected activity | Monthly volume above EUR 50,000 | 10 | s.30B |
| | Monthly volume above EUR 250,000 | 20 | s.30B |
| Source of funds | Not provided | 10 | s.35 (purpose and intended nature of the relationship) |
| Adverse media | Negative news linked to financial crime | 20 | s.39 |
| Red flags | Each red flag recorded by the analyst (section 6A) | 10 to 20 each | s.39, Schedule 4 |

### 4.2 Risk tiers

| Score | Tier | Due diligence level |
|---|---|---|
| 0 to 24 | Low | Standard CDD. Eligible for SDD only if no mandatory EDD trigger applies (s.34A). |
| 25 to 49 | Medium | Standard CDD. |
| 50 or more | High | EDD (s.39). |

Any mandatory EDD trigger (PEP or high risk third country) forces the tier to **High**, whatever the score.

## 5. Customer due diligence (CDD)

Before establishing a business relationship, the firm must (s.33 and s.35):

1. Identify the customer: full legal name, date of birth or incorporation, address, nationality or country of incorporation.
2. Verify that identity against a reliable and independent source (passport, national ID card, company registry extract).
3. Identify and take reasonable measures to verify every beneficial owner of a corporate customer.
4. Understand the purpose and intended nature of the relationship, including expected activity and source of funds.

### 5.1 Business verification

Companies, trusts and sole traders are also checked on the official register, and the register and number are recorded with the case:

| Country | Register |
|---|---|
| Ireland | CRO (Companies Registration Office) for companies; RBO (Register of Beneficial Ownership) for beneficial owners |
| Portugal | Certidão Permanente from the Registo Comercial; for a sole trader (empresário em nome individual), the NIF and the start of activity with the tax authority |
| Brazil | CNPJ record from the Receita Federal, compared with the articles of association (contrato social) |

The identity document type is recorded too (passport, national ID card such as the Portuguese Cartão de Cidadão or the Brazilian RG, residence permit or driving licence).

### 5.2 Proof of address

Individuals and sole traders must also provide a proof of address. For companies and trusts the registered office is confirmed on the official register (section 5.1).

| Requirement | Detail |
|---|---|
| Acceptable documents | Utility bill, bank or credit union statement, government letter (for example Revenue or Social Protection), home or motor insurance policy, tenancy agreement or mortgage statement |
| Content | The customer's full name and current address, matching the application |
| Age | Dated within the last **6 months** at onboarding and at each review |

The Act requires the customer's identity to be verified from reliable and independent sources (s.33). Verifying the address with a recent document is the firm's way of meeting that requirement, in line with the Central Bank AML Guidelines. The 6 month limit is a firm policy choice, not a figure set by the Act.

**Rule in the simulator:** the document type and its date are recorded with the case. If the address was not verified, or the document is undated, dated in the future or older than 6 months on the day it is assessed, CDD is **incomplete**. During a review the document is checked against the review date, so a proof that was valid at onboarding has to be renewed. A proof slightly over the limit can only be accepted through a documented exception (section 12A).

**Rule in the simulator:** if identity verification fails, the ID document has expired, the proof of address is missing or out of date, the business registration was not verified on the official register, or a corporate customer has no identified UBO, CDD is **incomplete**. The case cannot be approved. It can only be returned for more information or rejected. Section 33 does not allow a business relationship to proceed where CDD cannot be applied.

## 6. Enhanced due diligence (EDD)

EDD is mandatory when:

* **The customer or a UBO is a PEP** (s.37). The firm must obtain **senior management approval** before establishing the relationship, take adequate measures to establish the source of wealth and source of funds, and apply enhanced ongoing monitoring.
* **The customer is established in an EU high risk third country** (s.38A). The firm must obtain additional information on the customer, the UBOs, the source of funds and wealth, and the reasons for the relationship, with senior management approval.
* **The customer is otherwise assessed as High risk** (s.39).

**Rule in the simulator:** a High risk case can only be approved by a senior analyst or the MLRO, after confirming that EDD has been completed. For PEP and high risk third country cases the approver must be a different person from the case preparer (four eyes, section 10A). The approval and the name and role of the approver are written to the audit trail.

## 7. Sanctions screening

### 7.1 Method

Every customer name, and every UBO name for corporate customers, is screened against the loaded sanctions list before any decision. Names are normalised (lowercase, accents removed, punctuation removed, word order sorted) and compared with the Jaro Winkler similarity algorithm against every entry and every alias.

| Similarity | Result | Action |
|---|---|---|
| 0.92 or higher, and date of birth does not contradict | **Strong match** | Case blocked. Do not onboard. Do not release funds. Escalate immediately to the MLRO. |
| 0.82 to 0.919, or a strong name match with a different date of birth | **Potential match** | Onboarding paused. Analyst must review the hit and record whether it is a true match or a false positive, with reasons. |
| Below 0.82 | No match | Continue. |

### 7.2 Handling a true match

Where a match is confirmed, the firm must freeze any funds, must not make funds available to the person, and must report to the competent authority. In Ireland, the Central Bank of Ireland is the competent authority for financial sanctions. These obligations arise directly from EU sanctions regulations and apply regardless of the risk score.

### 7.3 Handling a false positive

The analyst records the distinguishing information (for example a different date of birth or nationality) in the case rationale. The hit is marked "cleared" and counts toward the false positive rate in the metrics dashboard.

## 8. PEP screening

PEP status is identified in two ways:

1. **Self declaration** by the customer in the onboarding form.
2. **List screening** of the customer and UBO names against the loaded PEP list, using the same matching method as sanctions.

A potential PEP match must be confirmed or cleared by the analyst. A confirmed PEP triggers mandatory EDD and senior management approval (section 6).

## 6A. Red flags

A red flag is an indicator that something does not add up. It is not proof of wrongdoing. Its purpose is to make sure the analyst stops, asks, and records the answer instead of simply processing the file. The list below is based on the higher risk factors in Schedule 4 of the Act and on common typologies:

| Group | Red flag | Points |
|---|---|---|
| Documents | Documents inconsistent with each other (name, date of birth or address differ) | 15 |
| Documents | Document appears altered, cropped or of unusually poor quality | 20 |
| Documents | Proof of address does not match the address given on the application | 15 |
| Behaviour | Customer reluctant or repeatedly slow to provide information | 10 |
| Behaviour | Unusual urgency or pressure to complete quickly | 10 |
| Behaviour | Acting through an intermediary with no clear reason | 10 |
| Funds | Funds not consistent with known income, occupation or business size | 20 |
| Funds | Funds coming from an unconnected third party | 20 |
| Funds | Large cash element with no clear explanation | 20 |
| Structure | Unnecessarily complex structure or no clear commercial rationale | 15 |
| Structure | Unexplained link to a higher risk jurisdiction | 15 |

**Rules in the simulator:**

* Any analyst can record or withdraw a red flag on an open case, with a note describing what was seen. The change and the new risk score are written to the audit trail.
* Each flag adds its points to the risk score (s.39: enhanced measures where the risk is higher), so several flags move a case to Medium or High risk.
* A case with red flags cannot be approved by an analyst, even under delegated authority. It goes to a senior analyst or the MLRO.
* The approver must confirm that every red flag has been explained by the customer and that the explanation is supported by evidence on file. Otherwise the approval is refused.
* If the explanation is not credible, the case is escalated to the MLRO, who decides whether a suspicious transaction report is needed (s.42, section 10).

## 9. Decisions and escalation

| Situation | Allowed decisions |
|---|---|
| Strong sanctions match | Reject and escalate to MLRO only |
| Potential sanctions or PEP match not yet reviewed | Escalate or request information |
| CDD incomplete | Request information or reject |
| High risk with EDD completed (approval by a senior analyst or the MLRO, see section 10A) | Approve, reject or escalate |
| Medium risk | Approve, reject or escalate |
| Low risk | Approve, reject or escalate |
| Any risk tier with red flags (section 6A) | Approve only by a senior analyst or the MLRO after every flag is explained; otherwise request information, escalate or reject |

**Human in the loop:** the simulator never approves a customer automatically. It produces a recommendation, and a named analyst must record the final decision with a written rationale.

**Approval under delegated authority:** analysts with delegated authority may approve Low and Medium risk cases. High risk approvals belong to senior analysts and the MLRO (section 10A).

## 9A. Information requests to the customer

When information or documents are missing, the analyst asks the customer for them in writing and the case moves to "Info requested". The simulator builds the list of outstanding items from the case (identity document, proof of address, beneficial owners, business register extract, source of funds and, for High risk or funds related red flags, evidence of source of funds and wealth) and drafts the message.

**Rule in the simulator:** the draft only asks for documents and gives a deadline. It never mentions screening results, PEP status, red flags, risk ratings or the MLRO, so that a routine request can never tip off a customer (s.49). This is checked by a unit test.

## 10. Suspicious activity and tipping off

If an analyst knows, suspects or has reasonable grounds to suspect money laundering or terrorist financing, they must escalate to the MLRO. The MLRO decides whether to file a suspicious transaction report with FIU Ireland (An Garda Síochána) and the Revenue Commissioners (s.42).

The customer must never be told that a report has been made or that an investigation is under way. Doing so is the offence of **tipping off** (s.49). In the simulator, the "Escalate to MLRO" action records an internal note only and never generates customer facing text.

## 10A. Access control and segregation of duties

The CJA 2010 requires designated persons to adopt internal policies, controls and procedures to prevent ML/TF (s.54), and the senior management approvals in sections 37 and 38A only mean something if the system can prove who approved what. The simulator therefore applies an identity and access management (IAM) layer to every action.

**Model:** role based access control (RBAC) combined with attribute based rules (ABAC). The role sets the baseline permissions. Attributes of the case (risk tier, status, preparer) and of the user (delegated authority) refine them. Anything not explicitly allowed is denied (least privilege).

| Role | Permissions |
|---|---|
| Analyst | Create cases, re-screen, clear hits as false positives, request information, escalate. Approve Low and Medium risk cases only if delegated authority has been granted. |
| Senior analyst | All analyst permissions, plus confirm sanctions true matches, approve or reject High risk cases after EDD, and give senior management approval for PEP and high risk third country cases. |
| MLRO | All permissions. Decides escalated cases and cases with sanctions matches, manages watchlists, grants or revokes delegated authority, resets data. |
| Internal auditor | Read only access to cases, metrics, audit trails and the access log. |

**Controls:**

* **Four eyes principle.** Senior management approval for PEP and high risk third country cases must be given by a senior analyst or the MLRO who did not prepare the case.
* **Delegated authority.** New analysts start without approval rights. The MLRO grants them once competency has been demonstrated, and the grant is logged.
* **Segregation of duties.** Internal audit cannot change anything. Only the MLRO decides escalated cases and changes reference data.
* **Accountability.** Every audit trail entry records the user and role. Sign ins, watchlist changes and privilege changes are written to a separate access log.

Sign in is simulated with a user switcher. A production system would use single sign on with multi factor authentication and enforce the same rules on the server.

## 11. Record keeping

Records of CDD documents, screening results, risk assessments, decisions and the full audit trail must be kept for **five years** after the business relationship ends or the occasional transaction is completed (s.55).

**Rule in the simulator:** every case keeps a timestamped, append only audit trail. Events can be added but never edited or deleted. The case export includes the audit trail.

## 12. Ongoing monitoring and periodic review

Customers are reviewed periodically according to their risk tier. The intervals below are an internal policy choice, not a statutory requirement.

| Tier | Review cycle |
|---|---|
| High | Every 12 months |
| Medium | Every 24 months |
| Low | Every 36 months |

A review is also triggered by any material change (event driven review). CDD applies to existing customers when their relevant circumstances change (s.33), and the relationship is monitored on an ongoing basis (s.35(3)).

### 12.1 Review triggers

| Trigger | Example |
|---|---|
| Periodic | Review date reached (status Due soon from 30 days before, Overdue after) |
| Change of beneficial ownership or control | New shareholder above 25% |
| Activity inconsistent with the expected profile | Monthly volume rises from EUR 3,000 to EUR 60,000 |
| Change of country | Customer moves to a non EEA or high risk third country |
| Identity document expired | Cartão de Cidadão or passport expires during the relationship |
| New adverse media, change in PEP status, sanctions list update | Any of these |

### 12.2 Review procedure

1. The analyst starts the review and records the trigger. The case returns to **Pending review**.
2. The customer is re-screened against the current lists and the documents are checked **against the review date**, not the onboarding date. An ID that expired since onboarding makes CDD incomplete.
3. Changed data (volume, source of funds, country, ID expiry, PEP status, adverse media, new UBO) is updated and logged with the before and after values, then the case is re-screened and re-scored.
4. The case needs a new decision under the normal rules. Approving it continues the relationship and sets the next review date; rejecting it exits the relationship. Both are kept in the review history.

## 12A. Exceptions

An exception is a documented, time limited deviation from this policy, for example an expired document while the renewal is pending. Internal policies, controls and procedures are required by s.54.

* Each exception records the type, the deviation, the **mitigating control** and a **resolution date of at most 90 days**. Anything longer is escalated to the MLRO.
* It is raised by the analyst and approved or rejected by a **senior analyst or the MLRO who did not raise it** (four eyes).
* An approved exception past its date shows as **Overdue** until it is closed with a note on how it was resolved.
* An exception **never overrides** the fail closed rules: incomplete CDD, unreviewed screening hits and sanctions matches still block approval.

## 12B. Quality assurance

* **Sample:** every High risk decision and 1 in 4 of the Low and Medium risk decisions. The sample is deterministic, so a case is always in or out.
* **Reviewer:** a senior analyst or the MLRO who did **not** take the decision (independence).
* **Checklist:** identity and business verification evidenced; screening hits reviewed with a reason; risk rating consistent; EDD evidence adequate (cannot be N/A on High risk); decision within delegated authority; rationale clear and supported.
* Any failed check fails the case and needs a written finding for the analyst. Results feed the pass rate by analyst and the error trend by check.
* A new decision after a review moves the old QA result to the history.

## 13. Metrics and reporting

The dashboard reports the following KYC and AML metrics so that management can monitor the effectiveness of the controls:

* Cases by status (approved, rejected, escalated, pending, information requested)
* Cases by risk tier and EDD rate
* Sanctions and PEP screening hits, and the false positive rate
* Escalation rate to the MLRO
* Average time from case creation to decision
* Cases with incomplete CDD
* Reviews overdue, due in the next 30 days, in progress and completed
* Open, overdue and pending exceptions
* QA sample size, pass rate, errors by check and pass rate by analyst
* Ageing of open cases and cases over the 48 hour service level

## 14. Limitations of this project

* Sanctions and PEP sample data are fictional. Real screening must use the current official lists.
* The high risk third country list is an illustrative subset and changes regularly.
* Proof of address and red flags are recorded by the analyst. The simulator does not read or authenticate documents.
* Identity verification is simulated with a checkbox. Real onboarding uses document checks and electronic verification providers.
* Risk weights are illustrative. A real firm calibrates them from its own business wide risk assessment.

## 15. References

* Criminal Justice (Money Laundering and Terrorist Financing) Act 2010, revised version: revisedacts.lawreform.ie/eli/2010/act/6
* Criminal Justice (Money Laundering and Terrorist Financing) (Amendment) Act 2018 (No. 26 of 2018)
* Regulation (EU) 2024/1624 (AMLR): eur-lex.europa.eu/eli/reg/2024/1624/oj
* Directive (EU) 2024/1640 (AMLD6): eur-lex.europa.eu/eli/dir/2024/1640/oj
* Regulation (EU) 2024/1620 (AMLA Regulation): eur-lex.europa.eu/eli/reg/2024/1620/oj
* Central Bank of Ireland, Anti Money Laundering and Countering the Financing of Terrorism Guidelines for the Financial Sector

# Messenger / E2EE
Repo e2e (3 tests) passes when no worker competes: discover→chat→realtime delivery→client decrypt→ack deletes server copy→read receipts; pending-invite→real chat; blocking. This supports server not retaining ciphertext after ack. I did NOT inspect the crypto code or prove the server cannot read plaintext. Multi-device, attachments, calls: UNVERIFIED.

# Propunere pentru un singur test WhatsApp către proprietar

Stare: **pregătit pentru revizuire, blocat pentru expediere**. Acest document nu reprezintă aprobarea unei trimiteri și nu activează notificările.

- Aplicație expeditor: TaxiCRM, prin transportul comun existent.
- Număr expeditor așteptat: +44 7737 290923; Phone Number ID 1406119395919653.
- Destinatar: numărul proprietarului, încă neconfirmat. Numărul +447700900001 din JSON este exclusiv sintetic.
- Eveniment demonstrat: Booking confirmed.
- Booking demonstrativ: SYNTHETIC-OWNER-TEST-20261105. Nu se creează și nu se modifică o rezervare reală.
- Template candidat existent în configurația comună: nac_booking_confirmation_v1, en_GB, UTILITY. Aprobarea curentă și ID-ul Meta trebuie reverificate doar prin citire.
- O singură încercare, maximum un POST către furnizor. Fără retry automat, SMS, campanie sau activare a workerelor.

Textul propus, dacă template-ul real corespunde definiției existente:

> Your Need A Cab Plus booking SYNTHETIC-OWNER-TEST-20261105 is confirmed. Please contact our team if your journey details change.

[Payloadul demonstrativ și hash-ul](evidence/adapters/owner-test-preview.json) pot fi regenerate offline. Hash-ul demonstrativ nu poate aproba o trimitere reală: trebuie fixate întâi destinatarul efectiv și snapshotul verificat al template-ului, apoi recalculat payloadul final.

Înainte de solicitarea aprobării efective, rezultatul pregătit trebuie să includă: destinatarul confirmat în configurația securizată, permisiunea operațională verificată, ID-ul/statusul/categoria/limba și fingerprintul template-ului, payloadul final și hash-ul lui, o cheie unică de operație, termenul-limită și traseul one-shot revizuit prin revendicarea durabilă și istoricul TaxiCRM. Nu este necesară activarea generală a notificărilor pentru acest test.

Execuția viitoare se oprește dacă există suprimare, preluare de către operator, lipsa permisiunii, modificarea template-ului, expirare sau o revendicare anterioară. Un timeout înseamnă UNKNOWN și interzice retrimiterea automată ori SMS-ul. ACCEPTED se înregistrează separat de DELIVERED/READ, care necesită evenimentele semnate ale furnizorului.

Nu s-a trimis niciun mesaj real în această etapă. Nu s-au activat Meta/SMS și nu s-a modificat producția.

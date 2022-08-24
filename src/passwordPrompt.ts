// See https://github.com/emacs-mirror/emacs/blob/3af9e84ff59811734dcbb5d55e04e1fdb7051e77/lisp/comint.el#L356-L386

// (concat
const intros = '(' + [
  //    "\\(^ *\\|"
  '^ *',
  
  //    (regexp-opt
  //     '("Enter" "enter" "Enter same" "enter same" "Enter the" "enter the"
  //       "Current"
  //       "Enter Auth" "enter auth" "Old" "old" "New" "new" "'s" "login"
  //       "Kerberos" "CVS" "UNIX" " SMB" "LDAP" "PEM" "SUDO"
  //       "[sudo]" "doas" "Repeat" "Bad" "Retype" "Verify")
  //     t)
  '(' + [
    "Enter",
    "enter", 
    "Enter same",
    "enter same",
    "Enter the", 
    "enter the",
    "Current",
    "Enter Auth",
    "enter auth",
    "Old", 
    "old",
    "New",
    "new",
    "'s",
    "login",
    "Kerberos",
    "CVS", 
    "UNIX",
    " SMB",
    "LDAP", 
    "PEM",
    "SUDO",
    "\\[sudo\\]", 
    "doas",
    "Repeat",
    "Bad",
    "Retype",
    "Verify", 
  ].join('|') + ')'
  //    ;; Allow for user name to precede password equivalent (Bug#31075).
  //    " +.*\\)"
  + ' +.*',
].join('|') + ')';


//    "\\(?:" (regexp-opt password-word-equivalents) "\\|Response\\)"
// See https://github.com/emacs-mirror/emacs/blob/3af9e84ff59811734dcbb5d55e04e1fdb7051e77/lisp/international/mule-conf.el#L1594-L1647
const passwordWords = '(?:' + [
  "password", "passcode", "passphrase", "pass phrase", "pin",
  //// These are sorted according to the GNU en_US locale.
  "암호",		// ko
  "パスワード",	// ja
  "ପ୍ରବେଶ ସଙ୍କେତ",	// or
  "ពាក្យសម្ងាត់",		// km
  "adgangskode",	// da
  "contraseña",	// es
  "contrasenya",	// ca
  "geslo",		// sl
  "hasło",		// pl
  "heslo",		// cs, sk
  "iphasiwedi",	// zu
  "jelszó",		// hu
  "lösenord",		// sv
  "lozinka",		// hr, sr
  "mật khẩu",		// vi
  "mot de passe",	// fr
  "parola",		// tr
  "pasahitza",		// eu
  "passord",		// nb
  "passwort",		// de
  "pasvorto",		// eo
  "salasana",		// fi
  "senha",		// pt
  "slaptažodis",	// lt
  "wachtwoord",	// nl
  "كلمة السر",		// ar
  "ססמה",		// he
  "лозинка",		// sr
  "пароль",		// kk, ru, uk
  "गुप्तशब्द",		// mr
  "शब्दकूट",		// hi
  "પાસવર્ડ",		// gu
  "సంకేతపదము",		// te
  "ਪਾਸਵਰਡ",		// pa
  "ಗುಪ್ತಪದ",		// kn
  "கடவுச்சொல்",		// ta
  "അടയാളവാക്ക്",		// ml
  "গুপ্তশব্দ",		// as
  "পাসওয়ার্ড",		// bn_IN
  "රහස්පදය",		// si
  "密码",		// zh_CN
  "密碼",		// zh_TW
  'Response'
].join('|') + ')';
//    "\\(?:\\(?:, try\\)? *again\\| (empty for no passphrase)\\| (again)\\)?"
const again = "(?:(?:, try)? *again| \\(empty for no passphrase\\)| \\(again\\))?";
//    ;; "[[:alpha:]]" used to be "for", which fails to match non-English.
//    "\\(?: [[:alpha:]]+ .+\\)?[[:blank:]]*[:：៖][[:space:]]*\\'"
const f0r = "(?: \\w+ .+)?[ \\t]*[:：៖]\\s*";
//    ;; The ccrypt encryption dialogue doesn't end with a colon, so
//    ;; treat it specially.
//    "\\|^Enter encryption key: (repeat) *\\'")
const ccrypt = "|^Enter encryption key: (repeat) *";

export const passwordPrompt = new RegExp(`${intros}${passwordWords}${again}${f0r}${ccrypt}`, 'i');

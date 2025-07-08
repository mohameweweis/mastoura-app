document.getElementById("loginBtn").addEventListener("click", () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  console.log("Attempt login with:", email, password);

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      console.log("Login success:", userCredential.user);
      localStorage.setItem("user", JSON.stringify(userCredential.user));
      window.location.href = "dashboard.html";
    })
    .catch((error) => {
      console.error("Login error:", error);
      document.getElementById("errorMsg").innerText = "بيانات الدخول غير صحيحة";
    });
});

import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

document.getElementById("loginBtn").addEventListener("click", () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      // حفظ نوع المستخدم (يمكن إضافة خاصية في Firestore لاحقاً)
      // هنا حفظ المستخدم فقط للتمثيل
      localStorage.setItem("user", JSON.stringify(user));
      window.location.href = "dashboard.html";
    })
    .catch((error) => {
      document.getElementById("errorMsg").innerText = "بيانات الدخول غير صحيحة";
      console.error("Login error:", error.message);
    });
});

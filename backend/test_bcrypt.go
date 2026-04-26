package main
import (
    "fmt"
    "golang.org/x/crypto/bcrypt"
)
func main() {
    password := "admin123"
    hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    fmt.Println(string(hash))
}

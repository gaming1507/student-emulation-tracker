# Student Emulation Tracker

Hệ thống theo dõi thi đua học sinh

## Tính năng
- Quản lý danh sách học sinh
- Chấm điểm bonus/penalty
- Import từ Excel/CSV
- Báo cáo theo tuần
- Bảng xếp hạng

## Deploy trên Render

1. Tạo Web Service mới trên Render
2. Kết nối repo GitHub này
3. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Environment Variables:
   - `NODE_ENV`: `production`
   - `SESSION_SECRET`: (tạo chuỗi ngẫu nhiên)
   - `PORT`: (để trống, Render tự set)

## Truy cập
- `/admin` - Trang quản trị
- `/user` - Trang học sinh
- `/overview?tuan=1` - Xem tổng kết tuần

## Tài khoản mặc định
- Username: `admin`
- Password: `admin123`
